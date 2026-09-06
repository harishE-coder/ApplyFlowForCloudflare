"""
ApplyFlow Centralized Silent AI Gateway (Production Grade).
Provides:
1. Dynamic multi-provider + multi-key resolution (Groq, OpenAI, Gemini).
2. Health-scoring dynamic load sorting (Success: +1, 429: -30, 5xx: -15, Timeout: -20).
3. Intra-provider model fallback tiers (70B -> 8B -> etc.).
4. End-to-end Request ID tracing and Idempotency keys.
5. 60-second Circuit Breaker cooldowns on retryable errors.
6. Prometheus & Dashboard-ready in-memory telemetry metrics.

Classification is API-key only. If no AI API key is configured, callers receive
AIServiceUnavailable instead of a local/offline classification fallback.
"""

import logging
import time
import uuid
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger("app.core.ai_gateway")


class AIServiceUnavailable(Exception):
    """Raised when all configured AI providers and keys are exhausted or unavailable."""


# Backward compatibility alias
AIGatewayError = AIServiceUnavailable


@dataclass
class Provider:
    """Represents a specific configured AI Provider instance and API key."""
    name: str                   # e.g. "Groq", "OpenAI", "Gemini"
    api_key: str                # secret token
    model: str                  # default preferred model
    fallback_models: list[str]  # intra-provider fallback models in order
    endpoint: str               # chat completions URL
    key_id: str                 # sanitized identifier (e.g. "Groq#1", "Groq#2", "OpenAI#1")
    priority_rank: int = 1      # initial priority rank (1 = highest)


class AIGateway:
    """
    Production-grade Centralized AI Gateway for ApplyFlow.
    """

    def __init__(self, default_cooldown_seconds: float = 60.0):
        self.default_cooldown_seconds = default_cooldown_seconds
        self._cooldowns: dict[str, float] = {}
        self._health_scores: dict[str, int] = {}

        # In-Memory Telemetry Metrics
        self._total_requests: int = 0
        self._total_failovers: int = 0
        self._provider_successes: dict[str, int] = {}
        self._provider_errors: dict[str, int] = {}
        self._provider_latencies: dict[str, list[int]] = {}

    def get_health_score(self, provider: Provider) -> int:
        """Returns the current dynamic health score (0-100) for a provider."""
        if provider.key_id not in self._health_scores:
            self._health_scores[provider.key_id] = 100
        return self._health_scores[provider.key_id]

    def adjust_health_score(self, provider: Provider, delta: int) -> None:
        """Adjusts the provider's health score clamped between 0 and 100."""
        current = self.get_health_score(provider)
        new_score = max(0, min(100, current + delta))
        self._health_scores[provider.key_id] = new_score

    def get_available_providers(self) -> list[Provider]:
        """
        Dynamically constructs the list of configured providers from settings.
        Any provider or key can be added, updated, or omitted via environment variables.
        """
        providers: list[Provider] = []
        seen_keys: set[str] = set()

        # 1. Groq Multiple Keys (Priority 1, 2, 3)
        groq_key_configs = [
            (settings.groq_api_key_1, "Groq#1", 1),
            (settings.groq_api_key_2, "Groq#2", 2),
            (settings.groq_api_key_3, "Groq#3", 3),
            (settings.groq_api_key, "Groq#Legacy", 4),
        ]
        groq_endpoint = "https://api.groq.com/openai/v1/chat/completions"
        groq_primary_model = settings.groq_model or "llama-3.3-70b-versatile"
        groq_fallbacks = [
            m for m in [
                groq_primary_model,
                "llama-3.1-8b-instant",
                "deepseek-r1-distill-llama-70b",
                "gemma2-9b-it",
            ]
            if m
        ]
        # De-duplicate model order
        groq_fallbacks = [m for i, m in enumerate(groq_fallbacks) if m not in groq_fallbacks[:i]]

        for key_val, key_id, rank in groq_key_configs:
            if key_val and key_val.strip() and key_val.strip() not in seen_keys:
                clean_k = key_val.strip()
                seen_keys.add(clean_k)
                providers.append(
                    Provider(
                        name="Groq",
                        api_key=clean_k,
                        model=groq_primary_model,
                        fallback_models=groq_fallbacks,
                        endpoint=groq_endpoint,
                        key_id=key_id,
                        priority_rank=rank,
                    )
                )

        # 2. OpenAI Key (Priority 4)
        if settings.openai_api_key and settings.openai_api_key.strip():
            clean_k = settings.openai_api_key.strip()
            if clean_k not in seen_keys:
                seen_keys.add(clean_k)
                providers.append(
                    Provider(
                        name="OpenAI",
                        api_key=clean_k,
                        model=settings.openai_model or "gpt-4o-mini",
                        fallback_models=["gpt-4o-mini", "gpt-3.5-turbo"],
                        endpoint="https://api.openai.com/v1/chat/completions",
                        key_id="OpenAI#1",
                        priority_rank=5,
                    )
                )

        # 3. Gemini Key (Priority 5)
        if settings.gemini_api_key and settings.gemini_api_key.strip():
            clean_k = settings.gemini_api_key.strip()
            if clean_k not in seen_keys:
                seen_keys.add(clean_k)
                providers.append(
                    Provider(
                        name="Gemini",
                        api_key=clean_k,
                        model=settings.gemini_model or "gemini-1.5-flash",
                        fallback_models=["gemini-1.5-flash", "gemini-1.5-pro"],
                        endpoint="https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
                        key_id="Gemini#1",
                        priority_rank=6,
                    )
                )

        # 4. If AI_PROVIDER is explicitly configured (e.g. "openai", "groq", "gemini"),
        # prioritize that provider's keys ahead of all others.
        target_provider = (settings.ai_provider or "").strip().lower()
        if target_provider:
            def provider_sort_key(p: Provider) -> tuple[int, int]:
                is_target = 0 if (target_provider in p.name.lower() or target_provider in p.key_id.lower()) else 1
                return (is_target, p.priority_rank)

            providers.sort(key=provider_sort_key)
            for idx, p in enumerate(providers, start=1):
                p.priority_rank = idx

        return providers

    def is_cooling(self, provider: Provider) -> bool:
        """Returns True if the provider is currently cooling down."""
        expires_at = self._cooldowns.get(provider.key_id, 0)
        return time.time() < expires_at

    def record_cooldown(self, provider: Provider, reason: str = "", delta_score: int = -20) -> None:
        """Enforces a circuit breaker cooldown on the provider and updates health score."""
        self._cooldowns[provider.key_id] = time.time() + self.default_cooldown_seconds
        self.adjust_health_score(provider, delta_score)

        # Metrics
        self._provider_errors[provider.key_id] = self._provider_errors.get(provider.key_id, 0) + 1

        logger.warning(
            f"[AI Gateway] Provider: {provider.key_id} entered {int(self.default_cooldown_seconds)}s cooldown. "
            f"Health Score: {self.get_health_score(provider)} | Reason: {reason}."
        )

    def record_success(self, provider: Provider, latency_ms: int) -> None:
        """Clears cooldown entry, increases health score (+1), and records latency telemetry."""
        self._cooldowns.pop(provider.key_id, None)
        self.adjust_health_score(provider, +1)

        # Metrics
        self._provider_successes[provider.key_id] = self._provider_successes.get(provider.key_id, 0) + 1
        if provider.key_id not in self._provider_latencies:
            self._provider_latencies[provider.key_id] = []
        self._provider_latencies[provider.key_id].append(latency_ms)
        if len(self._provider_latencies[provider.key_id]) > 50:
            self._provider_latencies[provider.key_id].pop(0)

    def cleanup_expired_cooldowns(self) -> None:
        """Removes expired cooldown entries."""
        now = time.time()
        expired = [k for k, exp in self._cooldowns.items() if now >= exp]
        for k in expired:
            self._cooldowns.pop(k, None)

    def get_telemetry(self) -> dict[str, Any]:
        """Returns Prometheus / Dashboard-ready gateway telemetry."""
        avg_latencies = {
            p_id: int(sum(lats) / max(len(lats), 1))
            for p_id, lats in self._provider_latencies.items()
        }
        return {
            "total_requests": self._total_requests,
            "total_failovers": self._total_failovers,
            "health_scores": dict(self._health_scores),
            "provider_successes": dict(self._provider_successes),
            "provider_errors": dict(self._provider_errors),
            "average_latency_ms": avg_latencies,
            "active_cooldowns": {
                p_id: max(0, int(exp - time.time()))
                for p_id, exp in self._cooldowns.items()
                if time.time() < exp
            },
        }

    async def chat_completion(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        temperature: float = 0.0,
        response_format: dict[str, str] | None = None,
        max_tokens: int = 1000,
        timeout: float = 25.0,
        request_id: str | None = None,
    ) -> dict[str, Any]:
        """
        Executes an AI chat completion request with:
        - Health-score prioritized provider order
        - Intra-provider model fallback
        - Silent failover across keys and providers
        - Request tracing & idempotency headers
        """
        self._total_requests += 1
        req_trace = request_id or uuid.uuid4().hex[:8]

        self.cleanup_expired_cooldowns()
        providers = self.get_available_providers()

        if not providers:
            logger.error(f"[AI Gateway] [Req: {req_trace}] No active AI providers configured.")
            raise AIServiceUnavailable(
                "No AI API key configured. Set GROQ_API_KEY, GROQ_API_KEY_1, "
                "OPENAI_API_KEY, or GEMINI_API_KEY."
            )

        # 1. Filter out providers currently in cooldown
        active_providers = [p for p in providers if not self.is_cooling(p)]

        # If all providers are in cooldown, pick by earliest cooldown expiry
        if not active_providers:
            logger.warning(f"[AI Gateway] [Req: {req_trace}] All providers in cooldown. Attempting earliest expiring provider.")
            active_providers = sorted(providers, key=lambda p: self._cooldowns.get(p.key_id, 0))

        # 2. Health-score sort: highest health score first, with priority rank as tie-breaker
        active_providers.sort(
            key=lambda p: (self.get_health_score(p), -p.priority_rank),
            reverse=True,
        )

        last_error = None
        start_time = time.time()
        failover_attempt = 0

        for provider in active_providers:
            # Models to try within this provider: preferred model first, then fallback models
            models_to_try = [model] if model else provider.fallback_models
            if not models_to_try:
                models_to_try = [provider.model]

            provider_succeeded = False

            for model_candidate in models_to_try:
                failover_attempt += 1
                call_start = time.time()

                headers = {
                    "Authorization": f"Bearer {provider.api_key}",
                    "Content-Type": "application/json",
                    "Idempotency-Key": f"applyflow-{req_trace}-{failover_attempt}",
                    "X-Request-ID": req_trace,
                }

                payload: dict[str, Any] = {
                    "model": model_candidate,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                }
                if response_format:
                    payload["response_format"] = response_format

                try:
                    async with httpx.AsyncClient(timeout=timeout) as client:
                        resp = await client.post(provider.endpoint, headers=headers, json=payload)
                        latency_ms = int((time.time() - call_start) * 1000)

                        # 1. SUCCESS (200 OK)
                        if resp.status_code == 200:
                            self.record_success(provider, latency_ms)
                            if failover_attempt > 1:
                                self._total_failovers += 1
                                logger.info(
                                    f"[AI Gateway] [Req: {req_trace}] Provider: {provider.key_id} | Model: {model_candidate} | "
                                    f"Status: Success | Latency: {latency_ms}ms | Failover Attempt: #{failover_attempt}"
                                )
                            provider_succeeded = True
                            result = resp.json()
                            result.setdefault("model", model_candidate)
                            result["_gateway"] = {
                                "provider": provider.name,
                                "provider_key_id": provider.key_id,
                                "model": model_candidate,
                            }
                            return result

                        # 2. RETRYABLE FAILURES
                        # 429 Rate Limit (-30 health score, 60s cooldown)
                        if resp.status_code == 429:
                            self.record_cooldown(provider, reason=f"HTTP 429 Rate Limit (Model: {model_candidate})", delta_score=-30)
                            last_error = f"{provider.key_id} ({model_candidate}) rate limited (429)"
                            # Break inner model loop to rotate provider/key immediately
                            break

                        # 5xx Server Errors (-15 health score)
                        if resp.status_code in (500, 502, 503, 504):
                            # Try next model in same provider first, if last model, trigger cooldown
                            last_error = f"{provider.key_id} ({model_candidate}) HTTP {resp.status_code}"
                            if model_candidate == models_to_try[-1]:
                                self.record_cooldown(provider, reason=f"HTTP {resp.status_code}", delta_score=-15)
                            continue

                        # 3. NON-RETRYABLE AUTH FAILURES (401 / 403)
                        if resp.status_code in (401, 403):
                            logger.error(
                                f"[AI Gateway] [Req: {req_trace}] Provider: {provider.key_id} authentication failed (HTTP {resp.status_code})."
                            )
                            last_error = f"{provider.key_id} HTTP {resp.status_code} Auth Failure"
                            break

                        # 4. OTHER CLIENT ERRORS (e.g. 400 Bad Request)
                        logger.error(f"[AI Gateway] [Req: {req_trace}] Client 4xx from {provider.key_id} ({model_candidate}): {resp.text}")
                        return resp.json()

                except (httpx.TimeoutException, httpx.NetworkError) as exc:
                    self.record_cooldown(provider, reason=f"Network timeout ({exc})", delta_score=-20)
                    last_error = f"{provider.key_id} timeout: {exc}"
                    break
                except Exception as exc:
                    logger.error(f"[AI Gateway] [Req: {req_trace}] Unexpected error from {provider.key_id}: {exc}")
                    last_error = str(exc)
                    break

            if provider_succeeded:
                break

        total_latency_ms = int((time.time() - start_time) * 1000)
        logger.error(f"[AI Gateway] [Req: {req_trace}] All AI providers exhausted after {total_latency_ms}ms. Last error: {last_error}")
        raise AIServiceUnavailable(f"All configured AI providers failed. Last error: {last_error}")


# Global Gateway Singleton
ai_gateway = AIGateway()


async def chat_completion(
    messages: list[dict[str, str]],
    model: str | None = None,
    temperature: float = 0.0,
    response_format: dict[str, str] | None = None,
    max_tokens: int = 1000,
    timeout: float = 25.0,
    request_id: str | None = None,
) -> dict[str, Any]:
    """
    Public entry point for all AI chat completions in ApplyFlow.
    Features health scoring, model fallback, silent failover, request tracing, and idempotency.
    """
    return await ai_gateway.chat_completion(
        messages=messages,
        model=model,
        temperature=temperature,
        response_format=response_format,
        max_tokens=max_tokens,
        timeout=timeout,
        request_id=request_id,
    )

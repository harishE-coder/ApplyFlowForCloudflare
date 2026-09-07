/**
 * ApplyFlow — Production AI Gateway (Cloudflare Workers)
 * 
 * Single source of truth for:
 * - Multi-key Groq rotation (GROQ_API_KEY_1, GROQ_API_KEY_2, GROQ_API_KEY_3, GROQ_API_KEY)
 * - Intra-provider model fallback
 * - Provider failover (Groq -> OpenAI -> Gemini)
 * - Isolate-local lightweight circuit breaker with cooldowns
 * - Immediate 401 Unauthorized handling (disables bad key without retrying)
 * - Request ID tracking & structured telemetry logging
 * - Timeout protection (20s AbortController)
 * - Zod schema validation (GroqAnalysisSchema)
 * - AI usage analytics persistence (ai_request_logs)
 */

import { GroqAnalysisSchema, type GroqAnalysis } from "../schemas/ai";
import type { Bindings } from "../types";
import { getDb } from "../db";

export interface ProviderAttempt {
  providerName: "Groq" | "OpenAI" | "Gemini";
  keyId: string;
  apiKey: string;
  endpoint: string;
  models: string[];
}

export interface GatewayTelemetry {
  healthScores: Record<string, number>;
  failureCounts: Record<string, number>;
  activeCooldowns: Record<string, number>;
}

export interface AiUsageLogEntry {
  requestId: string;
  provider: string;
  model: string;
  latencyMs: number;
  success: boolean;
  fallbackCount: number;
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Isolate-Local Lightweight Circuit Breaker State (Resets on Worker Cold Start)
// ---------------------------------------------------------------------------
const healthScores = new Map<string, number>();
const failureCounts = new Map<string, number>();
const cooldownExpiries = new Map<string, number>();

/**
 * Resets circuit breaker state (used for testing or maintenance)
 */
export function resetAiGatewayState(): void {
  healthScores.clear();
  failureCounts.clear();
  cooldownExpiries.clear();
}

/**
 * Returns current isolate-local telemetry
 */
export function getAiGatewayTelemetry(): GatewayTelemetry {
  const now = Date.now();
  const activeCooldowns: Record<string, number> = {};
  for (const [k, exp] of cooldownExpiries.entries()) {
    if (now < exp) {
      activeCooldowns[k] = Math.ceil((exp - now) / 1000);
    }
  }
  return {
    healthScores: Object.fromEntries(healthScores.entries()),
    failureCounts: Object.fromEntries(failureCounts.entries()),
    activeCooldowns,
  };
}

/**
 * Checks whether a key is currently cooling down
 */
export function isKeyInCooldown(keyId: string): boolean {
  const expiry = cooldownExpiries.get(keyId);
  if (!expiry) return false;
  if (Date.now() >= expiry) {
    cooldownExpiries.delete(keyId);
    return false;
  }
  return true;
}

/**
 * Marks a key immediately and permanently invalid/unhealthy (HTTP 401).
 * Sets health score directly to 0 and places in indefinite cooldown for this isolate.
 * Avoids any retries or future attempts on this key.
 */
export function recordAuthFailure(keyId: string): void {
  healthScores.set(keyId, 0);
  failureCounts.set(keyId, 999);
  // Mark key inactive for the lifetime of this warm isolate (1 hour)
  cooldownExpiries.set(keyId, Date.now() + 3600 * 1000);
}

/**
 * Records a failure on a provider key with tiered cooldowns:
 * 1 failure = 30s, 2 failures = 2m, 3+ failures = 5m.
 * Health score drops by 20 points (min 0).
 */
export function recordFailure(keyId: string, recoverable: boolean): void {
  const currentFailures = (failureCounts.get(keyId) || 0) + 1;
  failureCounts.set(keyId, currentFailures);

  const currentScore = healthScores.get(keyId) ?? 100;
  healthScores.set(keyId, Math.max(0, currentScore - 20));

  if (recoverable) {
    let cooldownMs = 30 * 1000; // 1st failure: 30s
    if (currentFailures === 2) {
      cooldownMs = 2 * 60 * 1000; // 2nd failure: 2m
    } else if (currentFailures >= 3) {
      cooldownMs = 5 * 60 * 1000; // 3+ failures: 5m
    }
    cooldownExpiries.set(keyId, Date.now() + cooldownMs);
  }
}

/**
 * Records a successful response on a provider key:
 * Clears consecutive failures and cooldown, increases health score by 5 (max 100).
 */
export function recordSuccess(keyId: string): void {
  failureCounts.set(keyId, 0);
  cooldownExpiries.delete(keyId);
  const currentScore = healthScores.get(keyId) ?? 100;
  healthScores.set(keyId, Math.min(100, currentScore + 5));
}

/**
 * Resolves candidate providers from environment bindings in required order:
 * 1. Groq (Key 1 -> Key 2 -> Key 3 -> Legacy)
 * 2. OpenAI
 * 3. Gemini
 */
export function resolveConfiguredProviders(
  env: Bindings,
  modelOverride?: string
): ProviderAttempt[] {
  const providers: ProviderAttempt[] = [];
  const seenKeys = new Set<string>();

  // Helper to append unique key
  const addGroqKey = (apiKey: string | undefined, keyId: string) => {
    if (!apiKey || !apiKey.trim()) return;
    const clean = apiKey.trim();
    if (seenKeys.has(clean)) return;
    seenKeys.add(clean);

    const groqModels = [
      modelOverride,
      "openai/gpt-oss-20b",
      "qwen/qwen3.8-27b",
      "openai/gpt-oss-120b",
    ].filter(Boolean) as string[];

    // Unique model list preserving priority
    const models = Array.from(new Set(groqModels));

    providers.push({
      providerName: "Groq",
      keyId,
      apiKey: clean,
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      models,
    });
  };

  // Stage 1: Groq Keys
  addGroqKey(env.GROQ_API_KEY_1, "GROQ_API_KEY_1");
  addGroqKey(env.GROQ_API_KEY_2, "GROQ_API_KEY_2");
  addGroqKey(env.GROQ_API_KEY_3, "GROQ_API_KEY_3");
  addGroqKey(env.GROQ_API_KEY, "GROQ_API_KEY");

  // Stage 2: OpenAI Key
  if (env.OPENAI_API_KEY && env.OPENAI_API_KEY.trim()) {
    const clean = env.OPENAI_API_KEY.trim();
    if (!seenKeys.has(clean)) {
      seenKeys.add(clean);
      providers.push({
        providerName: "OpenAI",
        keyId: "OPENAI_API_KEY",
        apiKey: clean,
        endpoint: "https://api.openai.com/v1/chat/completions",
        models: ["gpt-4o-mini", "gpt-3.5-turbo"],
      });
    }
  }

  // Stage 3: Gemini Key (OpenAI-compatible endpoint)
  if (env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim()) {
    const clean = env.GEMINI_API_KEY.trim();
    if (!seenKeys.has(clean)) {
      seenKeys.add(clean);
      providers.push({
        providerName: "Gemini",
        keyId: "GEMINI_API_KEY",
        apiKey: clean,
        endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        models: ["gemini-1.5-flash", "gemini-2.0-flash"],
      });
    }
  }

  return providers;
}

/**
 * Standard recruitment information extraction prompt
 */
export function buildExtractionPrompt(documentText: string): string {
  return `You are an expert ATS recruitment and resume parser AI. Analyze the following document (resume or interview update email) and extract candidate, skill, and interview details.

Return ONLY valid JSON matching this schema with no markdown formatting, no code fences, and no extra text:
{
  "candidate_name": "Full name of candidate",
  "email": "Email address or empty string",
  "phone": "Phone number or empty string",
  "skills": ["Array", "of", "skills"],
  "experience_years": 0,
  "education": "Highest degree or university or empty string",
  "current_company": "Current or latest employer or hiring company",
  "summary": "Brief 1-2 sentence executive summary",
  "confidence": 0.92,
  "role": "Role or designation or title",
  "company": "Target company name or hiring company",
  "round": "Interview round (e.g. Screening, Technical, HR, Final)",
  "status": "applied or interview or offer or rejected",
  "interview_date": "YYYY-MM-DD if scheduled, else empty string",
  "is_interview_mail": true
}

Document Content:
${documentText.slice(0, 8000)}`;
}

/**
 * Checks if an HTTP status code is recoverable (transient server/rate errors)
 */
function isRecoverableStatus(status: number): boolean {
  // 429 = Rate limited, 5xx = server error
  return status === 429 || (status >= 500 && status <= 599);
}

/**
 * Executes an HTTP fetch with AbortController timeout protection
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = 20000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (err: any) {
    if (err?.name === "AbortError" || controller.signal.aborted) {
      throw new Error(`AI Gateway request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parses and validates raw LLM response text into GroqAnalysis
 */
function parseAndValidateResponse(rawContent: string): GroqAnalysis {
  let parsed: any;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    // Strip markdown code fences if LLM included them
    const clean = rawContent
      .replace(/```(?:json)?/gi, "")
      .replace(/```/g, "")
      .trim();
    parsed = JSON.parse(clean);
  }

  return GroqAnalysisSchema.parse(parsed);
}

/**
 * Asynchronously persists AI usage telemetry into ai_request_logs table.
 * Non-blocking: will never throw or interrupt the main request flow.
 */
export async function recordAiUsageLog(
  env: Bindings,
  entry: AiUsageLogEntry
): Promise<void> {
  if (!env.DATABASE_URL) return;
  try {
    const sql = getDb(env.DATABASE_URL);
    await sql`
      CREATE TABLE IF NOT EXISTS ai_request_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id VARCHAR(64) NOT NULL,
        provider VARCHAR(32) NOT NULL,
        model VARCHAR(64) NOT NULL,
        latency_ms INT NOT NULL,
        success BOOLEAN NOT NULL,
        fallback_count INT NOT NULL DEFAULT 0,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      INSERT INTO ai_request_logs (
        request_id,
        provider,
        model,
        latency_ms,
        success,
        fallback_count,
        error_message
      ) VALUES (
        ${entry.requestId},
        ${entry.provider},
        ${entry.model},
        ${entry.latencyMs},
        ${entry.success},
        ${entry.fallbackCount},
        ${entry.errorMessage || null}
      )
    `;
  } catch (err: any) {
    // Non-blocking telemetry warning
    console.warn(`[AI Analytics Log Warning] Failed to persist telemetry: ${err?.message}`);
  }
}

/**
 * Aggregates AI usage analytics from ai_request_logs for admin dashboard.
 */
export async function getAiUsageAnalytics(env: Bindings) {
  const telemetry = getAiGatewayTelemetry();
  if (!env.DATABASE_URL) {
    return { telemetry, error: "Database not configured" };
  }
  try {
    const sql = getDb(env.DATABASE_URL);
    const summary = await sql`
      SELECT
        COUNT(*)::int AS total_requests,
        COUNT(*) FILTER (WHERE success = true)::int AS successful_requests,
        ROUND((COUNT(*) FILTER (WHERE success = true)::numeric / NULLIF(COUNT(*), 0) * 100), 1)::float AS success_rate,
        ROUND(AVG(latency_ms)::numeric, 1)::float AS avg_latency_ms,
        SUM(fallback_count)::int AS total_fallbacks
      FROM ai_request_logs
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `;
    const providerStats = await sql`
      SELECT
        provider,
        COUNT(*)::int AS requests,
        COUNT(*) FILTER (WHERE success = true)::int AS successes,
        ROUND((COUNT(*) FILTER (WHERE success = true)::numeric / NULLIF(COUNT(*), 0) * 100), 1)::float AS success_rate,
        ROUND(AVG(latency_ms)::numeric, 1)::float AS avg_latency_ms
      FROM ai_request_logs
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY provider
      ORDER BY requests DESC
    `;
    const recentLogs = await sql`
      SELECT request_id, provider, model, latency_ms, success, fallback_count, created_at
      FROM ai_request_logs
      ORDER BY created_at DESC
      LIMIT 20
    `;
    return {
      telemetry,
      summary: summary[0] || {},
      provider_breakdown: providerStats,
      recent_requests: recentLogs,
    };
  } catch (err: any) {
    return {
      telemetry,
      error: err?.message,
    };
  }
}

/**
 * Primary Gateway Function
 * Single source of truth for all AI selection, key rotation, retries, and failovers.
 * 
 * @param env Cloudflare Workers bindings
 * @param promptOrDocText Prompt or raw text of resume or email to analyze
 * @param modelOverride Optional specific model request
 * @param timeoutMs Request timeout per attempt (default: 20000ms)
 * @param requestId Optional request ID for end-to-end tracing
 */
export async function callAiGateway(
  env: Bindings,
  promptOrDocText: string,
  modelOverride?: string,
  timeoutMs: number = 20000,
  requestId?: string
): Promise<GroqAnalysis> {
  const reqId = requestId || `ai_${crypto.randomUUID().slice(0, 8)}`;
  const providers = resolveConfiguredProviders(env, modelOverride);

  if (providers.length === 0) {
    throw new Error(
      "No AI API keys configured. Please set GROQ_API_KEY (or GROQ_API_KEY_1..3), OPENAI_API_KEY, or GEMINI_API_KEY."
    );
  }

  const prompt = promptOrDocText.includes("Return ONLY valid JSON")
    ? promptOrDocText
    : buildExtractionPrompt(promptOrDocText);

  let lastError: Error | null = null;
  let fallbackCount = 0;
  const traceSteps: string[] = [];
  const overallStartTime = Date.now();

  for (let pIdx = 0; pIdx < providers.length; pIdx++) {
    const provider = providers[pIdx];

    // Check circuit breaker cooldown
    if (isKeyInCooldown(provider.keyId)) {
      const remainingCooldown = Math.max(
        0,
        Math.ceil(((cooldownExpiries.get(provider.keyId) || 0) - Date.now()) / 1000)
      );
      traceSteps.push(`${provider.providerName} (${provider.keyId}) → Cooldown skipped (${remainingCooldown}s remaining)`);
      console.log(
        `[Request: ${reqId}] Provider: ${provider.providerName} | Key: ${provider.keyId} | Status: Cooldown (${remainingCooldown}s remaining) | Action: Skipping`
      );
      continue;
    }

    const nextProvider = providers[pIdx + 1];
    const nextDesc = nextProvider ? `${nextProvider.providerName} (${nextProvider.keyId})` : "None (Exhausted)";

    // Try models in order for this provider/key
    for (const model of provider.models) {
      const startTime = Date.now();
      console.log(
        `[Request: ${reqId}] Provider: ${provider.providerName} | Key: ${provider.keyId} | Model: ${model}`
      );

      try {
        const payload: any = {
          model,
          messages: [
            {
              role: "system",
              content:
                "You are a specialized recruitment information extraction engine that strictly returns valid JSON matching the requested schema with no markdown.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.1,
        };

        // Response format JSON mode is supported by Groq, OpenAI, and Gemini OpenAI-compat endpoint
        payload.response_format = { type: "json_object" };

        const res = await fetchWithTimeout(
          provider.endpoint,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${provider.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
          timeoutMs
        );

        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          const status = res.status;

          // 1. Handle HTTP 401 Unauthorized: Invalid or revoked API key
          if (status === 401) {
            recordAuthFailure(provider.keyId);
            traceSteps.push(`${provider.providerName} (${provider.keyId}) → 401 Unauthorized (invalid key, disabled)`);
            console.warn(
              `[Request: ${reqId}] Provider: ${provider.providerName}\nKey: ${provider.keyId}\nStatus: 401 Unauthorized\nFallback reason: Invalid or revoked API key. Key marked permanently unhealthy.\nNext: ${nextDesc}`
            );
            lastError = new Error(
              `${provider.providerName} (${provider.keyId}) returned HTTP 401 Unauthorized (invalid key)`
            );
            fallbackCount++;
            // Do NOT retry other models on an invalid key -> immediately proceed to next provider/key
            break;
          }

          const isRecoverable = isRecoverableStatus(status);

          console.warn(
            `[Request: ${reqId}] Provider: ${provider.providerName}\nKey: ${provider.keyId}\nModel: ${model}\nStatus: ${status}\nFallback reason: HTTP ${status}\nNext: ${nextDesc}`
          );

          if (isRecoverable) {
            recordFailure(provider.keyId, true);
            traceSteps.push(`${provider.providerName} (${provider.keyId}) → HTTP ${status}`);
            lastError = new Error(
              `${provider.providerName} (${provider.keyId}) returned HTTP ${status}: ${errBody.slice(0, 150)}`
            );
            fallbackCount++;
            // Recoverable error on this key -> fail over to next key or provider
            break;
          } else {
            const isModelError = status === 404 || (status === 400 && errBody.toLowerCase().includes("model"));
            if (isModelError) {
              traceSteps.push(`${provider.providerName} (${provider.keyId}, ${model}) → Model unsupported (${status})`);
              lastError = new Error(
                `Unsupported model '${model}' on ${provider.providerName}: ${errBody.slice(0, 150)}`
              );
              // Try next model for this key without cooling down the key
              continue;
            }

            // Permanent client error (e.g. malformed JSON, invalid prompt) -> do not retry
            traceSteps.push(`${provider.providerName} (${provider.keyId}) → Client error HTTP ${status}`);
            throw new Error(
              `Permanent client error HTTP ${status} from ${provider.providerName}: ${errBody.slice(0, 150)}`
            );
          }
        }

        const json: any = await res.json();
        const rawContent = json?.choices?.[0]?.message?.content || "{}";
        const analysis = parseAndValidateResponse(rawContent);

        const latency = Date.now() - startTime;
        traceSteps.push(`${provider.providerName} (${provider.keyId}) → Success (${latency}ms)`);

        console.log(
          `[Request: ${reqId}]\n` +
          `Provider: ${provider.providerName}\n` +
          `Key: ${provider.keyId}\n` +
          `Model: ${model}\n` +
          `Final successful provider: ${provider.providerName}\n` +
          `Latency: ${latency}ms\n` +
          `Trace:\n${traceSteps.map((s) => `  - ${s}`).join("\n")}`
        );

        recordSuccess(provider.keyId);

        // Record telemetry asynchronously without blocking return
        recordAiUsageLog(env, {
          requestId: reqId,
          provider: provider.providerName,
          model,
          latencyMs: latency,
          success: true,
          fallbackCount,
        }).catch(() => {});

        return analysis;
      } catch (err: any) {
        // If it was already determined to be a permanent client error, rethrow immediately
        if (err?.message?.startsWith("Permanent client error")) {
          throw err;
        }

        const isTimeout = err?.message?.includes("timed out");
        if (isTimeout) {
          traceSteps.push(`${provider.providerName} (${provider.keyId}) → Timeout (${Math.round(timeoutMs / 1000)}s)`);
          console.warn(
            `[Request: ${reqId}] Provider: ${provider.providerName}\nKey: ${provider.keyId}\nModel: ${model}\nStatus: Timeout\nTimeout reason: Request timed out after ${Math.round(timeoutMs / 1000)}s\nNext: ${nextDesc}`
          );
        } else {
          traceSteps.push(`${provider.providerName} (${provider.keyId}) → Network error (${err?.message || "unknown"})`);
          console.warn(
            `[Request: ${reqId}] Provider: ${provider.providerName}\nKey: ${provider.keyId}\nModel: ${model}\nStatus: Network/Runtime Error\nFallback reason: ${err?.message || "Unknown error"}\nNext: ${nextDesc}`
          );
        }

        recordFailure(provider.keyId, true);
        lastError = err;
        fallbackCount++;

        // On timeout or network failure, fail over to next key/provider
        break;
      }
    }
  }

  // All keys, models, and providers failed
  console.error(
    `[Request: ${reqId}] AI Gateway Exhausted after ${fallbackCount} fallbacks.\nTrace:\n${traceSteps.map((s) => `  - ${s}`).join("\n")}`
  );

  // Record failure telemetry asynchronously
  recordAiUsageLog(env, {
    requestId: reqId,
    provider: "Exhausted",
    model: "None",
    latencyMs: Date.now() - overallStartTime,
    success: false,
    fallbackCount,
    errorMessage: lastError?.message || "All providers exhausted",
  }).catch(() => {});

  throw (
    lastError ||
    new Error("AI Gateway failed: all available keys, models, and providers were exhausted.")
  );
}

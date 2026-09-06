"""
API-Key AI Teacher Engine (Stage 3):
- Uses Groq Llama 3.3 70B (llama-3.3-70b-versatile) with temperature=0.1
- Enforces strict deterministic JSON extraction
- Separates dynamic round_name from event status and normalized round_type (Enum)
- Employs third-party ATS domain filtering for clean company extraction
- Does not use local classifier predictions or offline heuristic classification
"""

import json
import logging
from pathlib import Path
from typing import Any

from app.core.ai_gateway import AIServiceUnavailable, chat_completion
from app.modules.interview_intelligence.schemas import (
    EmailCategory,
    EventStatus,
    GroqTeacherResult,
    NormalizedEmail,
    RoundType,
)

logger = logging.getLogger("interview_intelligence.teacher")

IGNORED_ATS_DOMAINS = {
    "greenhouse.io", "lever.co", "ashbyhq.com", "myworkday.com", "workday.com",
    "smartrecruiters.com", "workablemail.com", "bamboohr.com", "jobvite.com",
    "taleo.net", "icims.com", "hirevue.com", "testgorilla.com", "hackerrank.com",
    "codesignal.com", "codility.com", "coderpad.io", "gmail.com", "outlook.com", "yahoo.com"
}


class GroqTeacherService:
    """Service to invoke an API-key AI provider for structured recruiting extraction."""

    def __init__(self, prompt_version: str = "teacher_v1"):
        self.prompt_version = prompt_version
        self._prompt_template: str | None = None

    def _get_prompt_template(self) -> str:
        """Loads versioned system prompt markdown template from prompts directory."""
        if self._prompt_template is None:
            prompt_path = Path(__file__).parent / "prompts" / f"interview_{self.prompt_version}.md"
            if prompt_path.exists():
                self._prompt_template = prompt_path.read_text(encoding="utf-8")
            else:
                self._prompt_template = (
                    "You are a Senior Recruiter AI Teacher. Extract JSON with keys: "
                    "it_related (bool), category (string), company (string), role (string), "
                    "round_name (string), round_type (string), status (string), confidence (int), "
                    "meeting_link (string), deadline (string), reason (string)."
                )
        return self._prompt_template

    def build_user_payload(
        self,
        email_data: NormalizedEmail | dict[str, Any],
    ) -> dict[str, Any]:
        """Constructs sanitized payload for API prompt input."""
        if isinstance(email_data, NormalizedEmail):
            payload = {
                "subject": email_data.subject,
                "sender_email": email_data.sender_email,
                "sender_domain": email_data.sender_domain,
                "body": email_data.body,
                "links": email_data.links,
                "attachments": email_data.attachment_names,
            }
        else:
            payload = {
                "subject": email_data.get("subject", ""),
                "sender_email": email_data.get("sender_email", ""),
                "sender_domain": email_data.get("sender_domain", ""),
                "body": email_data.get("body", ""),
                "links": email_data.get("links", []),
                "attachments": email_data.get("attachment_names", []),
            }

        return payload

    async def classify_with_teacher(
        self,
        email_data: NormalizedEmail | dict[str, Any],
        recent_corrections: list[dict[str, Any]] | None = None,
    ) -> GroqTeacherResult:
        """
        Invokes AI Gateway to extract structured JSON with multi-key failover.
        Optionally accepts recent human recruiter corrections as few-shot prompt memory,
        allowing the AI to continuously adapt without local retraining.
        Requires a configured AI API key; no local/offline classification fallback
        is allowed for intake decisions.
        """
        system_prompt = self._get_prompt_template()
        if recent_corrections:
            memory_block = "\n\n## RECRUITER CORRECTIONS & PROMPT MEMORY (FEW-SHOT EXAMPLES):\n"
            memory_block += (
                "Human recruiters have manually corrected the following past classifications. "
                "Treat these as authoritative ground truth to guide your category decision:\n"
            )
            for c in recent_corrections:
                subj = f'"{c.get("subject", "")}"' if c.get("subject") else "Email"
                comp = f' | Company: {c.get("company")}' if c.get("company") else ""
                old_lbl = c.get("old_label") or "unknown"
                new_lbl = c.get("new_label")
                notes = f' (Notes: {c.get("notes")})' if c.get("notes") else ""
                memory_block += f'- Subject: {subj}{comp} -> Correct Category: "{new_lbl}" [Previously misclassified: "{old_lbl}"]{notes}\n'
            system_prompt += memory_block

        user_content = json.dumps(self.build_user_payload(email_data), ensure_ascii=False, indent=2)

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]

        try:
            data = await chat_completion(
                messages=messages,
                temperature=0.1,
                response_format={"type": "json_object"},
                timeout=20.0,
            )
            raw_json_str = data["choices"][0]["message"]["content"]
            parsed = json.loads(raw_json_str)

            if "error" in parsed or not parsed.get("category"):
                raise ValueError("AI Gateway returned no category")

            # Validate and normalize category, round_type, and status
            category = self._normalize_category(parsed.get("category"))
            round_type = self._normalize_round_type(parsed.get("round_type"), category)
            event_status = self._normalize_status(parsed.get("status"), category)
            round_name = parsed.get("round_name") or parsed.get("round")
            company = self._clean_company(parsed.get("company"), email_data)

            return GroqTeacherResult(
                it_related=bool(parsed.get("it_related", True)),
                category=category,
                company=company,
                role=parsed.get("role"),
                round_name=round_name,
                round_type=round_type,
                status=event_status,
                round=round_name,
                confidence=int(parsed.get("confidence", 95)),
                meeting_link=parsed.get("meeting_link"),
                deadline=parsed.get("deadline"),
                reason=str(parsed.get("reason", "AI Gateway structured extraction.")),
                prompt_version=self.prompt_version,
            )
        except Exception as e:
            logger.error(f"AI Gateway Teacher call failed: {e}")
            raise AIServiceUnavailable(
                "AI interview intelligence classification failed. Configure a valid AI API key and try again."
            ) from e

    def _clean_company(self, extracted_company: str | None, email_data: Any) -> str | None:
        """Filters out third-party ATS platforms (greenhouse, lever, ashby) from company name."""
        if extracted_company:
            clean = extracted_company.strip()
            if clean.lower() not in {"greenhouse", "lever", "ashby", "workday", "smartrecruiters", "jobvite"}:
                return clean

        # Heuristic fallback: check subject line
        subject = email_data.subject if isinstance(email_data, NormalizedEmail) else email_data.get("subject", "")
        if subject:
            words = [w.strip() for w in subject.split() if len(w.strip()) >= 3]
            skip_words = {"interview", "technical", "screening", "assessment", "invitation", "application", "details", "update", "round", "online", "take-home", "with", "from", "your", "for"}
            for w in words:
                if w.lower() not in skip_words and w.lower() not in {"greenhouse", "lever", "ashby", "workday"}:
                    return w.capitalize()

        return None

    def _normalize_category(self, raw_category: str | None) -> str:
        """Ensures category matches one of 13 canonical label taxonomy values."""
        if not raw_category:
            return EmailCategory.OTHER.value
        clean = raw_category.strip().lower().replace(" ", "_").replace("-", "_")
        valid_cats = {c.value for c in EmailCategory}
        if clean in valid_cats:
            return clean

        # Taxonomy fallback mapping
        mapping = {
            "interview_invitation": EmailCategory.INTERVIEW.value,
            "screening": EmailCategory.HR_SCREENING.value,
            "online_assessment": EmailCategory.TECHNICAL_ASSESSMENT.value,
            "assessment": EmailCategory.TECHNICAL_ASSESSMENT.value,
            "coding_challenge": EmailCategory.TECHNICAL_ASSESSMENT.value,
            "takehome": EmailCategory.TAKE_HOME.value,
            "assignment": EmailCategory.TAKE_HOME.value,
            "confirmed": EmailCategory.INTERVIEW_CONFIRMATION.value,
            "reschedule": EmailCategory.INTERVIEW_RESCHEDULE.value,
            "cancelled": EmailCategory.INTERVIEW_CANCELLED.value,
            "canceled": EmailCategory.INTERVIEW_CANCELLED.value,
            "followup": EmailCategory.RECRUITER_FOLLOWUP.value,
            "offer_letter": EmailCategory.APPLICATION_UPDATE.value,
        }
        return mapping.get(clean, EmailCategory.OTHER.value)

    def _normalize_round_type(self, raw_type: str | None, category: str) -> str:
        """Normalizes round_type to strict RoundType Enum."""
        if raw_type:
            clean = raw_type.strip().lower().replace(" ", "_").replace("-", "_")
            valid_types = {r.value for r in RoundType}
            if clean in valid_types:
                return clean

        mapping = {
            EmailCategory.HR_SCREENING.value: RoundType.HR_SCREENING.value,
            EmailCategory.TECHNICAL_ASSESSMENT.value: RoundType.TECHNICAL_ASSESSMENT.value,
            EmailCategory.TAKE_HOME.value: RoundType.TECHNICAL_ASSESSMENT.value,
            EmailCategory.INTERVIEW.value: RoundType.INTERVIEW.value,
            EmailCategory.INTERVIEW_CONFIRMATION.value: RoundType.INTERVIEW.value,
            EmailCategory.INTERVIEW_RESCHEDULE.value: RoundType.INTERVIEW.value,
            EmailCategory.REJECTION.value: RoundType.REJECTION.value,
        }
        return mapping.get(category, RoundType.OTHER.value)

    def _normalize_status(self, raw_status: str | None, category: str) -> str:
        """Normalizes status to strict EventStatus Enum."""
        if raw_status:
            clean = raw_status.strip().capitalize()
            valid_statuses = {s.value for s in EventStatus}
            if clean in valid_statuses:
                return clean

        mapping = {
            EmailCategory.INTERVIEW_CONFIRMATION.value: EventStatus.CONFIRMED.value,
            EmailCategory.INTERVIEW_RESCHEDULE.value: EventStatus.RESCHEDULED.value,
            EmailCategory.INTERVIEW_CANCELLED.value: EventStatus.CANCELLED.value,
            EmailCategory.REJECTION.value: EventStatus.REJECTED.value,
        }
        return mapping.get(category, EventStatus.SCHEDULED.value)

# Global singleton instance
groq_teacher = GroqTeacherService(prompt_version="teacher_v1")

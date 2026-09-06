"""
Groq AI Interview Mail Detector Service.
Calls official Groq Chat Completions API with temperature 0.
First determines if the email is a genuine recruitment/interview update (INTERVIEW_MAIL vs NOT_RELATED).
If NOT_RELATED -> Returns is_interview_mail=False.
If INTERVIEW_MAIL -> Extracts candidate_name, company, role, status, round, interview_date.
No confidence scores.
No offline/local keyword classification fallback is used; an AI API key is required.
"""

import json
import logging
from typing import Any

from app.core.ai_gateway import AIServiceUnavailable, chat_completion

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an ATS recruitment email parser and classifier.
Your FIRST responsibility is to determine whether the email is a genuine recruitment/interview update (INTERVIEW_MAIL) or completely unrelated (NOT_RELATED like marketing, newsletter, billing, OTP, discount, spam, or general meetings).

If the email is NOT a recruitment/interview update, return is_interview_mail as false and leave all other string fields empty.
If the email IS a recruitment/interview update, return is_interview_mail as true and extract the structured fields.

Never invent missing information. Never include confidence scores or explanations. Return JSON only."""

USER_PROMPT_TEMPLATE = """Classify and extract recruitment details from the following email text.

Return ONLY a JSON object matching this schema:
{{
  "is_interview_mail": true or false,
  "candidate_name": "<Full Name or empty>",
  "company": "<Company Name or empty>",
  "role": "<Job Role / Title or empty>",
  "status": "<Submitted|Shortlisted|Round 1|Round 2|Technical|Manager|HR|Offer|Rejected|Hold or empty>",
  "round": "<e.g. Round 1, Round 2, Technical, HR, Manager, Offer, Shortlisted or empty>",
  "interview_date": "<YYYY-MM-DD or empty>",
  "resume_id_tag": "<e.g. RES101, RES-101, or empty if not mentioned>"
}}

Email Content:
{email_text}
"""


class GroqService:
    @classmethod
    async def extract_email_entities(cls, raw_email: str) -> dict[str, Any]:
        """
        Send raw extracted email text to AI Gateway with temperature 0.
        Uses centralized multi-key failover and circuit breaking.
        First determines if the email is INTERVIEW_MAIL or NOT_RELATED.
        Raises AIServiceUnavailable instead of making a local guess when API
        credentials are missing or all configured providers fail.
        """
        import re

        # Regex fallback for resume tag e.g. RES101, RES-101
        tag_match = re.search(r'\b(RES[-_]?\d+)\b', raw_email, re.IGNORECASE)
        fallback_tag = tag_match.group(1).upper() if tag_match else None

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": USER_PROMPT_TEMPLATE.format(email_text=raw_email)},
        ]

        try:
            resp_data = await chat_completion(
                messages=messages,
                temperature=0.0,
                response_format={"type": "json_object"},
                max_tokens=500,
            )

            if not resp_data or "choices" not in resp_data or not resp_data["choices"]:
                raise ValueError("AI Gateway returned no choices for email extraction.")

            content = resp_data["choices"][0]["message"]["content"]
            parsed = json.loads(content)

            is_interview = bool(parsed.get("is_interview_mail", False))
            if not is_interview:
                return {
                    "is_interview_mail": False,
                    "candidate_name": "",
                    "company": "",
                    "role": "",
                    "status": "",
                    "round": "",
                    "interview_date": "",
                    "resume_id_tag": "",
                }

            extracted_tag = (parsed.get("resume_id_tag") or "").strip() or fallback_tag or ""

            return {
                "is_interview_mail": True,
                "candidate_name": (parsed.get("candidate_name") or "").strip(),
                "company": (parsed.get("company") or "").strip(),
                "role": (parsed.get("role") or "").strip() or "Software Engineer",
                "status": (parsed.get("status") or "Shortlisted").strip() or "Shortlisted",
                "round": (parsed.get("round") or "Round 1").strip() or "Round 1",
                "interview_date": (parsed.get("interview_date") or "").strip() or None,
                "resume_id_tag": extracted_tag,
            }
        except Exception as e:
            logger.error(f"AI Gateway extract error: {e}")
            raise AIServiceUnavailable(
                "AI email classification failed. Configure a valid AI API key and try again."
            ) from e

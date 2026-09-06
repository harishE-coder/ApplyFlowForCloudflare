"""
Interview Intelligence Pipeline Orchestrator (v1.0 Production-Ready):
Coordinates the complete end-to-end ingestion flow:
1. Parse email (.eml, .pdf, or raw text)
2. Staging in Supabase Storage with atomic rollback
3. First-class conversation thread_id resolution / propagation
4. API-key AI classification and structured extraction
5. Application matching by company / role / domain with 3rd-party ATS filtering
6. Conversation threading & timeline event deduplication separating round from status
7. Database persistence and status updates
"""

import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.interview_intelligence.application_matcher import ApplicationMatcher
from app.modules.interview_intelligence.models import EmailTrainingData
from app.modules.interview_intelligence.parser import EmailParser
from app.modules.interview_intelligence.schemas import (
    EmailCategory,
    GroqTeacherResult,
    NormalizedEmail,
    ProcessEmailResponse,
)
from app.modules.interview_intelligence.storage import supabase_storage
from app.modules.interview_intelligence.teacher import groq_teacher
from app.modules.interview_intelligence.thread_matcher import ThreadMatcher

logger = logging.getLogger("interview_intelligence.orchestrator")


class InterviewPipelineOrchestrator:
    """Orchestrates end-to-end recruiter email intelligence ingestion."""

    @classmethod
    async def process_email(
        cls,
        session: AsyncSession,
        content: bytes | str,
        filename: str | None = None,
        mime_type: str | None = None,
        client_id: uuid.UUID | None = None,
        uploader_id: uuid.UUID | None = None,
    ) -> ProcessEmailResponse:
        """
        Executes complete unified pipeline for a single email file or text.
        """
        # Step 1: Parse Email
        parsed_email = EmailParser.parse_any(content, filename=filename, mime_type=mime_type)

        raw_bytes = content if isinstance(content, bytes) else content.encode("utf-8")
        file_ext = filename.split(".")[-1] if (filename and "." in filename) else "txt"

        # Step 2: Supabase Storage Staging with Retry-Safe Scope
        with supabase_storage.retry_safe_upload_scope() as staged_keys:
            raw_storage_key = supabase_storage.upload_raw_file(
                raw_bytes=raw_bytes,
                email_hash=parsed_email.email_hash,
                file_ext=file_ext,
                received_time=parsed_email.received_time,
            )
            staged_keys.append(raw_storage_key)
            parsed_email.raw_storage_key = raw_storage_key

            storage_key = supabase_storage.upload_normalized_json(
                email_data=parsed_email.to_storage_payload(),
                email_hash=parsed_email.email_hash,
                received_time=parsed_email.received_time,
            )
            staged_keys.append(storage_key)

            # Step 3: Resolve Conversation Thread ID
            thread_id = await ThreadMatcher.resolve_or_create_thread_id(session, parsed_email)

            # Step 4: Fetch recent recruiter corrections as prompt memory (few-shot dynamic alignment)
            recent_corrections = await cls._fetch_recent_corrections(session, limit=5)

            # Step 5: API-key AI classification and structured extraction.
            teacher_res: GroqTeacherResult = await groq_teacher.classify_with_teacher(
                email_data=parsed_email,
                recent_corrections=recent_corrections,
            )
            category = teacher_res.category
            if not teacher_res.it_related and category not in {
                EmailCategory.NON_IT.value,
                EmailCategory.OTHER.value,
            }:
                category = EmailCategory.OTHER.value

            company = teacher_res.company or cls._heuristic_company_extract(parsed_email)
            role = teacher_res.role
            round_name = teacher_res.round_name or teacher_res.round
            round_type = teacher_res.round_type
            status_value = teacher_res.status
            meeting_link = teacher_res.meeting_link or cls._heuristic_meeting_link(parsed_email)
            deadline = teacher_res.deadline
            confidence = teacher_res.confidence
            source = "api_key"
            decision = "api_classified"
            ai_reasoning = teacher_res.reason

            # Step 5: Create Database Email Record with thread_id
            email_record = EmailTrainingData(
                id=uuid.uuid4(),
                version=1,
                thread_id=thread_id,
                message_id=parsed_email.message_id,
                in_reply_to=parsed_email.in_reply_to,
                email_hash=parsed_email.email_hash,
                subject=parsed_email.subject,
                sender_email=parsed_email.sender_email,
                sender_domain=parsed_email.sender_domain,
                sender_name=parsed_email.sender_name,
                body_preview=parsed_email.body_preview,
                storage_key=storage_key,
                raw_storage_key=raw_storage_key,
                body_sha256=parsed_email.body_sha256,
                attachment_metadata=parsed_email.attachment_metadata,
                company=company,
                role=role,
                category=category,
                confidence=confidence,
                source=source,
                classification_source_version=f"{source}_{teacher_res.prompt_version}",
                pipeline_version="interview_pipeline_v2.0",
                needs_retraining=False,
                ai_reasoning=ai_reasoning,
                processing_status="classified",
            )
            session.add(email_record)

            # Step 6: Application Matching with 3rd-party ATS precedence
            matched_app = await ApplicationMatcher.match_application(
                session=session,
                company=company,
                role=role,
                sender_domain=parsed_email.sender_domain,
                subject=parsed_email.subject,
                body_text=parsed_email.body,
                client_id=client_id,
            )
            app_id = matched_app.id if matched_app else None
            if matched_app and not company:
                company = matched_app.company

            # Step 7: Thread & Event Timeline Deduplication
            action, event_record = await ThreadMatcher.match_and_deduplicate_event(
                session=session,
                email_record=email_record,
                email_data=parsed_email,
                category=category,
                company=company,
                role=role,
                round_name=round_name,
                round_type=round_type,
                status_value=status_value,
                meeting_link=meeting_link,
                deadline=deadline,
                thread_id=thread_id,
                application_id=app_id,
            )

            # Step 8: Sync Matched Application Status
            if matched_app:
                await ApplicationMatcher.sync_application_status(
                    session=session,
                    application=matched_app,
                    category=category,
                    round_name=round_name,
                    meeting_link=meeting_link,
                    email_preview=parsed_email.body_preview,
                )

            await session.commit()

            return ProcessEmailResponse(
                status="success",
                action=action,
                email_id=email_record.id,
                email_hash=email_record.email_hash,
                thread_id=thread_id,
                category=category,
                confidence=confidence,
                decision=decision,
                source=source,
                company=company,
                role=role,
                round_name=event_record.round_name if event_record else round_name,
                round_type=event_record.round_type if event_record else round_type,
                round=event_record.round_name if event_record else (round_name or None),
                event_sequence=event_record.event_sequence if event_record else None,
                event_id=event_record.id if event_record else None,
                application_id=app_id,
                meeting_link=meeting_link,
                deadline=deadline,
                ai_reasoning=ai_reasoning,
                needs_retraining=email_record.needs_retraining,
                pipeline_version="interview_pipeline_v2.0",
            )

    @staticmethod
    def _heuristic_company_extract(email: NormalizedEmail) -> str | None:
        """Extracts plausible company name from subject or sender domain (excluding ATS platforms)."""
        ignored = {
            "greenhouse", "lever", "workday", "ashby", "ashbyhq", "smartrecruiters", "gmail",
            "outlook", "yahoo", "hackerrank", "codesignal", "codility", "coderpad",
            "calendly", "zoom", "google", "microsoft", "testgorilla", "hirevue"
        }
        if email.sender_domain and "." in email.sender_domain:
            root = email.sender_domain.split(".")[0].strip().lower()
            if root not in ignored and len(root) >= 3:
                return root.capitalize()

        if email.subject:
            # Common formats: "Stripe Online Technical Assessment", "Amazon Interview"
            words = [w.strip() for w in email.subject.split() if len(w.strip()) >= 3]
            skip_words = {"interview", "technical", "screening", "assessment", "invitation", "application", "details", "update", "round", "online", "take-home", "with", "from", "your", "for"}
            for w in words:
                if w.lower() not in skip_words and w.lower() not in ignored:
                    return w.capitalize()

        return None

    @staticmethod
    def _heuristic_meeting_link(email: NormalizedEmail) -> str | None:
        """Extracts meeting link from links list."""
        for link in email.links:
            if any(p in link.lower() for p in ["zoom.us", "meet.google.com", "teams.microsoft.com", "calendly.com"]):
                return link
        return None

    @classmethod
    async def _fetch_recent_corrections(
        cls,
        session: AsyncSession,
        limit: int = 5,
    ) -> list[dict]:
        """
        Fetches the latest human recruiter corrections (ReviewAction joined with EmailTrainingData)
        to inject as few-shot prompt memory into the AI Teacher classification call.
        This continuously teaches the AI provider from past feedback with zero local retraining.
        """
        from sqlalchemy import desc, select
        from app.modules.interview_intelligence.models import EmailTrainingData, ReviewAction

        try:
            stmt = (
                select(ReviewAction, EmailTrainingData.subject, EmailTrainingData.company)
                .join(EmailTrainingData, ReviewAction.email_id == EmailTrainingData.id)
                .order_by(desc(ReviewAction.created_at))
                .limit(limit)
            )
            res = await session.execute(stmt)
            rows = res.all()
            corrections = []
            for action, subject, company in rows:
                corrections.append({
                    "subject": subject or "",
                    "company": company or "",
                    "old_label": action.old_label or "unknown",
                    "new_label": action.new_label,
                    "notes": action.notes or "",
                })
            return corrections
        except Exception as err:
            logger.debug(f"Could not load recruiter corrections for prompt memory: {err}")
            return []


# Global singleton instance
pipeline_orchestrator = InterviewPipelineOrchestrator()

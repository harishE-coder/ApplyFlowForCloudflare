"""
Comprehensive Test Suite for Phase 1: Multi-Format Parser & Supabase Storage Lifecycle
Tests:
1. Sender name, domain, email, and Message-ID parsing (.eml, .pdf, text).
2. Supabase Storage upload, download, metadata headers, and existence checks.
3. Atomic rollback / retry-safe scope (zero orphaned files on DB failure).
4. Dual SQLite/Postgres database persistence and relations (including optimistic locking & review actions).
"""

import io
import uuid
from datetime import datetime, timezone

import pytest
from app.core.database import Base
from app.modules.interview_intelligence.models import (
    EmailTrainingData,
    InterviewEvent,
    ReviewAction,
)
from app.modules.interview_intelligence.parser import (
    EmailParser,
    compute_sha256,
    parse_sender_info,
)
from app.modules.interview_intelligence.schemas import EmailCategory
from app.modules.interview_intelligence.storage import supabase_storage
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


def test_sender_info_extraction():
    # Various real-world From header variations
    cases = [
        ("Amazon Recruiting <recruiting@amazon.jobs>", ("Amazon Recruiting", "recruiting@amazon.jobs", "amazon.jobs")),
        ("Google Talent <talent@google.com>", ("Google Talent", "talent@google.com", "google.com")),
        ("<no-reply@greenhouse.io>", ("", "no-reply@greenhouse.io", "greenhouse.io")),
        ("plain-email@stripe.com", ("", "plain-email@stripe.com", "stripe.com")),
        ('\"Doe, John (Meta)\" <jdoe@meta.com>', ("Doe, John (Meta)", "jdoe@meta.com", "meta.com")),
    ]
    for raw_from, expected in cases:
        assert parse_sender_info(raw_from) == expected


def test_plain_text_parser_with_headers():
    raw_email_text = """From: Alice Recruiter <alice@netflix.com>
To: candidate@applyflow.com
Subject: Invitation: Technical Screening - Senior Backend Engineer
Date: Tue, 01 Sep 2026 10:00:00 +0000
Message-ID: <netflix-screening-1002@netflix.com>

Hi Candidate,

Thank you for your interest in Netflix. We would like to invite you for a 45-minute technical screen.
Please choose your preferred time here: https://calendly.com/alice-netflix/tech-screen
Or join our interview room directly: https://netflix.zoom.us/j/987654321

Best regards,
Alice
"""
    parsed = EmailParser.parse_text(raw_email_text)
    assert parsed.subject == "Invitation: Technical Screening - Senior Backend Engineer"
    assert parsed.sender_email == "alice@netflix.com"
    assert parsed.sender_domain == "netflix.com"
    assert parsed.sender_name == "Alice Recruiter"
    assert parsed.message_id == "netflix-screening-1002@netflix.com"
    assert len(parsed.links) == 2
    assert "https://calendly.com/alice-netflix/tech-screen" in parsed.links
    assert "https://netflix.zoom.us/j/987654321" in parsed.links
    assert parsed.email_hash is not None
    assert len(parsed.email_hash) == 64


def test_eml_parser_multipart_html_attachments_and_message_id():
    raw_eml_bytes = b"""MIME-Version: 1.0
Message-ID: <uber-interview-555@uber.com>
Date: Tue, 01 Sep 2026 12:30:00 +0000
From: Uber Talent Acquisition <recruiting@uber.com>
To: dev@applyflow.com
Subject: Uber Full-Stack Coding Assessment Details
Content-Type: multipart/mixed; boundary="===============BOUNDARY=="

--===============BOUNDARY==
Content-Type: text/html; charset="utf-8"
Content-Transfer-Encoding: 7bit

<html>
  <body>
    <p>Hello Candidate,</p>
    <p>Please complete your timed assessment on <a href="https://codesignal.com/assessment/uber-123">CodeSignal Assessment</a>.</p>
    <p>Attached is the interview guide and calendar invite.</p>
  </body>
</html>

--===============BOUNDARY==
Content-Type: application/pdf; name="Interview_Preparation_Guide.pdf"
Content-Disposition: attachment; filename="Interview_Preparation_Guide.pdf"
Content-Transfer-Encoding: base64

JVBERi0xLjQKJcTl8uXr...
--===============BOUNDARY==
Content-Type: text/calendar; name="invite.ics"
Content-Disposition: attachment; filename="invite.ics"
Content-Transfer-Encoding: 7bit

BEGIN:VCALENDAR
VERSION:2.0
SUMMARY:Uber Technical Round 1
END:VCALENDAR
--===============BOUNDARY==--
"""
    parsed = EmailParser.parse_eml(raw_eml_bytes)
    assert parsed.message_id == "uber-interview-555@uber.com"
    assert parsed.sender_email == "recruiting@uber.com"
    assert parsed.sender_domain == "uber.com"
    assert parsed.sender_name == "Uber Talent Acquisition"
    assert "CodeSignal Assessment" in parsed.body or "codesignal.com" in parsed.body
    assert "https://codesignal.com/assessment/uber-123" in parsed.links
    assert len(parsed.attachment_names) == 2
    assert "Interview_Preparation_Guide.pdf" in parsed.attachment_names
    assert "invite.ics" in parsed.attachment_names
    assert len(parsed.attachment_metadata) == 2
    assert parsed.attachment_metadata[0]["name"] == "Interview_Preparation_Guide.pdf"
    assert parsed.attachment_metadata[0]["content_type"] == "application/pdf"
    assert parsed.attachment_metadata[1]["name"] == "invite.ics"
    assert parsed.attachment_metadata[1]["content_type"] == "text/calendar"


def test_pdf_email_parser():
    # Construct a minimal valid PDF in memory
    import pypdf

    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=300, height=300)
    pdf_bytes_io = io.BytesIO()
    writer.write(pdf_bytes_io)
    pdf_content = pdf_bytes_io.getvalue()

    parsed = EmailParser.parse_pdf(pdf_content)
    assert parsed.source_format == "pdf"
    assert parsed.body_sha256 is not None
    assert parsed.processing_status == "parsed"


def test_supabase_storage_raw_and_normalized_lifecycle():
    """Verify raw file and normalized JSON uploads, downloads, and lifecycle in Supabase storage."""
    email_hash = "a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef"
    received_dt = datetime(2026, 9, 1, 14, 0, 0, tzinfo=timezone.utc)
    raw_eml_content = b"From: recruiting@apple.com\nSubject: Staff Engineer Interview\n\nWelcome!"

    # 1. Upload original raw .eml
    raw_storage_key = supabase_storage.upload_raw_file(
        raw_bytes=raw_eml_content,
        email_hash=email_hash,
        file_ext="eml",
        received_time=received_dt,
        metadata={"subject": "Staff Engineer Interview"},
    )
    assert raw_storage_key == f"emails/raw/2026/09/01/{email_hash}.eml"
    assert supabase_storage.file_exists(raw_storage_key) is True

    # 2. Upload normalized JSON
    sample_json = {
        "message_id": "apple-job-777@apple.com",
        "subject": "Staff Engineer Interview",
        "sender_email": "recruiting@apple.com",
        "sender_name": "Apple Talent",
        "sender_domain": "apple.com",
        "body": "Dear Candidate, you have been shortlisted for the Staff Engineer role.",
        "body_preview": "Dear Candidate, you have been shortlisted...",
        "body_sha256": compute_sha256("Dear Candidate, you have been shortlisted for the Staff Engineer role."),
        "links": ["https://apple.webex.com/meet/staff-round"],
        "attachment_names": ["NDA.pdf"],
        "attachment_metadata": [{"name": "NDA.pdf", "size": 1024, "content_type": "application/pdf"}],
        "received_time": "2026-09-01T14:00:00Z",
        "email_hash": email_hash,
        "raw_storage_key": raw_storage_key,
        "source_format": "eml",
    }
    normalized_storage_key = supabase_storage.upload_normalized_json(
        email_data=sample_json,
        email_hash=email_hash,
        received_time=received_dt,
        metadata={"company": "Apple"},
    )
    assert normalized_storage_key == f"emails/normalized/2026/09/01/{email_hash}.json"
    assert supabase_storage.file_exists(normalized_storage_key) is True

    # 3. Download raw and normalized files
    downloaded_raw = supabase_storage.download_raw_file(raw_storage_key)
    assert downloaded_raw == raw_eml_content

    downloaded_json = supabase_storage.download_email(normalized_storage_key)
    assert downloaded_json is not None
    assert downloaded_json["message_id"] == "apple-job-777@apple.com"
    assert downloaded_json["raw_storage_key"] == raw_storage_key
    assert downloaded_json["attachment_metadata"][0]["name"] == "NDA.pdf"

    # 4. Clean up
    assert supabase_storage.delete_file(raw_storage_key) is True
    assert supabase_storage.delete_file(normalized_storage_key) is True
    assert supabase_storage.file_exists(raw_storage_key) is False
    assert supabase_storage.file_exists(normalized_storage_key) is False


def test_retry_safe_supabase_upload_scope_rollback():
    """Verify that if a simulated database error occurs, staged Supabase keys are cleaned up."""
    orphaned_hash = "deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678"
    raw_key = ""
    norm_key = ""

    with pytest.raises(RuntimeError):
        with supabase_storage.retry_safe_upload_scope() as staged_keys:
            raw_key = supabase_storage.upload_raw_file(
                raw_bytes=b"sample failure content",
                email_hash=orphaned_hash,
                file_ext="eml",
            )
            staged_keys.append(raw_key)

            norm_key = supabase_storage.upload_normalized_json(
                email_data={"test": "data"},
                email_hash=orphaned_hash,
            )
            staged_keys.append(norm_key)

            assert supabase_storage.file_exists(raw_key) is True
            assert supabase_storage.file_exists(norm_key) is True

            # Simulate database crash
            raise RuntimeError("Database connection lost during transaction!")

    # Verify both staged keys were automatically cleaned up after exception
    assert supabase_storage.file_exists(raw_key) is False
    assert supabase_storage.file_exists(norm_key) is False


def test_label_taxonomy_enum():
    assert EmailCategory.INTERVIEW == "interview"
    assert EmailCategory.TECHNICAL_ASSESSMENT == "technical_assessment"
    assert EmailCategory.HR_SCREENING == "hr_screening"
    assert EmailCategory.TAKE_HOME == "take_home"
    assert EmailCategory.REJECTION == "rejection"
    assert EmailCategory.INTERVIEW_CONFIRMATION == "interview_confirmation"
    assert EmailCategory.INTERVIEW_RESCHEDULE == "interview_reschedule"
    assert EmailCategory.INTERVIEW_CANCELLED == "interview_cancelled"
    assert EmailCategory.RECRUITER_FOLLOWUP == "recruiter_followup"
    assert EmailCategory.APPLICATION_UPDATE == "application_update"
    assert EmailCategory.RESPONSE_REQUEST == "response_request"
    assert EmailCategory.NON_IT == "non_it"
    assert EmailCategory.OTHER == "other"
    assert len(EmailCategory) == 13


@pytest.mark.anyio
async def test_database_persistence_and_relationships():
    """Tests dual-compatible SQLite/PostgreSQL schema with relationships, optimistic locking, and disagreements."""
    test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async_session = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        # 1. Insert EmailTrainingData with optimistic locking version and source version
        email_record = EmailTrainingData(
            id=uuid.uuid4(),
            version=1,
            message_id="msg-anthropic-12345@anthropic.com",
            email_hash="b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef12",
            subject="Senior AI Engineer Interview - ApplyFlow",
            sender_email="recruiting@anthropic.com",
            sender_domain="anthropic.com",
            sender_name="Anthropic Talent",
            body_preview="Hi candidate, we were impressed with your application...",
            storage_key="emails/normalized/2026/09/01/b2c3d4e5.json",
            raw_storage_key="emails/raw/2026/09/01/b2c3d4e5.eml",
            body_sha256="c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef1234",
            attachment_metadata=[{"name": "Interview_Guide.pdf", "size": 248000, "content_type": "application/pdf"}],
            company="Anthropic",
            role="Senior AI Engineer",
            category=EmailCategory.TECHNICAL_ASSESSMENT.value,
            confidence=99,
            source="groq",
            classification_source_version="groq_llama_3.3",
            ai_reasoning="Detected technical take-home coding challenge instructions and repository link.",
            processing_status="classified",
        )
        session.add(email_record)
        await session.commit()

        # 2. Insert InterviewEvent linked to email_record
        event_record = InterviewEvent(
            id=uuid.uuid4(),
            email_id=email_record.id,
            event_type="technical_assessment",
            round="Take-Home Challenge",
            status="Scheduled",
            scheduled_at=datetime(2026, 9, 5, 15, 0, 0),
            meeting_link="https://meet.google.com/xyz-uvw-rst",
            recruiter="Anthropic Talent",
            raw_json={"stage": "Technical 1", "duration": 60},
        )
        session.add(event_record)

        # 3. Insert ReviewAction audit entry
        review_action = ReviewAction(
            id=uuid.uuid4(),
            email_id=email_record.id,
            reviewer="QA Admin",
            old_label="other",
            new_label="technical_assessment",
            notes="Verified API-key classification.",
        )
        session.add(review_action)
        await session.commit()

        # 4. Query and verify relationships, optimistic locking, and fields
        from sqlalchemy import select
        res = await session.execute(
            select(EmailTrainingData).where(EmailTrainingData.message_id == "msg-anthropic-12345@anthropic.com")
        )
        queried_email = res.scalar_one_or_none()
        assert queried_email is not None
        assert queried_email.version == 1
        assert queried_email.sender_email == "recruiting@anthropic.com"
        assert queried_email.classification_source_version == "groq_llama_3.3"
        assert "take-home" in queried_email.ai_reasoning
        assert queried_email.category == "technical_assessment"
        assert len(queried_email.interview_events) == 1
        assert len(queried_email.review_actions) == 1
        assert queried_email.review_actions[0].new_label == "technical_assessment"

        # Optimistic locking update test
        queried_email.version += 1
        queried_email.category = EmailCategory.INTERVIEW.value
        await session.commit()

        res_updated = await session.execute(
            select(EmailTrainingData).where(EmailTrainingData.id == email_record.id)
        )
        updated_rec = res_updated.scalar_one()
        assert updated_rec.version == 2
        assert updated_rec.category == "interview"

    await test_engine.dispose()

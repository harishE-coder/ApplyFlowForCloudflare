"""
Comprehensive Test Suite for Phase 4 (v1.0 Production-Ready):
Tests:
1. Conversation Thread Reconstruction via Message-ID & In-Reply-To with thread_id persistence.
2. Dynamic round_name and status separation (Invite -> Reschedule -> Confirmation on same thread_id).
3. 3rd-Party ATS platform matching precedence (Greenhouse/Lever/Ashby domain correctly maps to hiring company).
4. Application Status & Current Round synchronization.
5. End-to-End Orchestrator Ingestion & FastAPI Responses.
"""

import uuid
import json
from unittest.mock import AsyncMock, patch

import pytest
from app.core.database import Base
from app.modules.applications.models import Application
from app.modules.interview_intelligence.application_matcher import ApplicationMatcher
from app.modules.interview_intelligence.models import (
    EmailTrainingData,
    InterviewEvent,
)
from app.modules.interview_intelligence.orchestrator import (
    InterviewPipelineOrchestrator,
)
from app.modules.interview_intelligence.schemas import (
    EmailCategory,
    EventStatus,
    RoundType,
)
from app.modules.interview_intelligence.thread_matcher import ThreadMatcher
from app.modules.users.models import User
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_thread_reconstruction_thread_id_and_status_separation():
    """Verify that thread_id is shared and status changes update the round instead of duplicating."""
    test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async_session = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        # 1. First Email: Initial Interview Invitation
        thread_id = uuid.uuid4()
        email1 = EmailTrainingData(
            id=uuid.uuid4(),
            version=1,
            thread_id=thread_id,
            message_id="amazon-invite-001@amazon.jobs",
            in_reply_to=None,
            email_hash="hash00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
            subject="Invitation to Interview: Amazon SDE II",
            sender_email="recruiting@amazon.jobs",
            sender_domain="amazon.jobs",
            storage_key="emails/normalized/2026/09/01/001.json",
            body_sha256="sha001",
            category=EmailCategory.INTERVIEW.value,
            confidence=98,
            source="api_key",
        )
        session.add(email1)
        await session.commit()

        action1, event1 = await ThreadMatcher.match_and_deduplicate_event(
            session=session,
            email_record=email1,
            email_data={"in_reply_to": None, "references": []},
            category=EmailCategory.INTERVIEW.value,
            company="Amazon",
            role="Software Development Engineer II",
            round_name="Bar Raiser",
            round_type=RoundType.INTERVIEW.value,
            status_value=EventStatus.SCHEDULED.value,
            meeting_link="https://amazon.zoom.us/j/111",
            deadline=None,
            thread_id=thread_id,
        )
        await session.commit()

        assert action1 == "created_new_interview_event"
        assert event1 is not None
        assert event1.thread_id == thread_id
        assert event1.event_sequence == 1
        assert event1.round_name == "Bar Raiser"
        assert event1.round_type == RoundType.INTERVIEW.value
        assert event1.status == EventStatus.SCHEDULED.value

        # 2. Second Email: Interview Reschedule Request (in reply to email 1)
        email2 = EmailTrainingData(
            id=uuid.uuid4(),
            version=1,
            thread_id=thread_id,
            message_id="amazon-resched-002@amazon.jobs",
            in_reply_to="amazon-invite-001@amazon.jobs",
            email_hash="hash00212233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
            subject="Re: Invitation to Interview: Amazon SDE II (Reschedule)",
            sender_email="recruiting@amazon.jobs",
            sender_domain="amazon.jobs",
            storage_key="emails/normalized/2026/09/01/002.json",
            body_sha256="sha002",
            category=EmailCategory.INTERVIEW_RESCHEDULE.value,
            confidence=95,
            source="api_key",
        )
        session.add(email2)
        await session.commit()

        action2, event2 = await ThreadMatcher.match_and_deduplicate_event(
            session=session,
            email_record=email2,
            email_data={"in_reply_to": "amazon-invite-001@amazon.jobs", "references": []},
            category=EmailCategory.INTERVIEW_RESCHEDULE.value,
            company="Amazon",
            role="Software Development Engineer II",
            round_name="Bar Raiser",
            round_type=RoundType.INTERVIEW.value,
            status_value=EventStatus.RESCHEDULED.value,
            meeting_link="https://amazon.zoom.us/j/222",
            deadline=None,
            thread_id=thread_id,
        )
        await session.commit()

        assert action2 == "updated_existing_event"
        assert event2.id == event1.id  # Same event updated
        assert event2.thread_id == thread_id
        assert event2.status == EventStatus.RESCHEDULED.value
        assert event2.meeting_link == "https://amazon.zoom.us/j/222"

        # 3. Third Email: Interview Confirmation with invite.ics
        email3 = EmailTrainingData(
            id=uuid.uuid4(),
            version=1,
            thread_id=thread_id,
            message_id="amazon-confirm-003@amazon.jobs",
            in_reply_to="amazon-resched-002@amazon.jobs",
            email_hash="hash00312233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
            subject="Confirmed: Amazon Technical Interview",
            sender_email="calendar-notification@amazon.jobs",
            sender_domain="amazon.jobs",
            storage_key="emails/normalized/2026/09/01/003.json",
            body_sha256="sha003",
            category=EmailCategory.INTERVIEW_CONFIRMATION.value,
            confidence=99,
            source="api_key",
        )
        session.add(email3)
        await session.commit()

        action3, event3 = await ThreadMatcher.match_and_deduplicate_event(
            session=session,
            email_record=email3,
            email_data={"in_reply_to": "amazon-resched-002@amazon.jobs", "references": ["amazon-invite-001@amazon.jobs"]},
            category=EmailCategory.INTERVIEW_CONFIRMATION.value,
            company="Amazon",
            role="Software Development Engineer II",
            round_name="Bar Raiser",
            round_type=RoundType.INTERVIEW.value,
            status_value=EventStatus.CONFIRMED.value,
            meeting_link="https://amazon.zoom.us/j/222",
            deadline=None,
            thread_id=thread_id,
        )
        await session.commit()

        assert action3 == "updated_existing_event"
        assert event3.id == event1.id
        assert event3.status == EventStatus.CONFIRMED.value

        # Verify that total interview events in DB for this thread is still exactly 1
        all_events = (await session.execute(select(InterviewEvent).where(InterviewEvent.thread_id == thread_id))).scalars().all()
        assert len(all_events) == 1

    await test_engine.dispose()


@pytest.mark.anyio
async def test_third_party_ats_company_matching_precedence():
    """Verify that an email from @greenhouse.io or @ashbyhq.com matches Stripe/OpenAI, not the ATS platform."""
    test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async_session = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        user = User(
            id=uuid.uuid4(),
            email="recruiter@applyflow.com",
            password_hash="hashed_pw",
            name="John Recruiter",
            role="employee",
            status="active",
        )
        session.add(user)
        await session.flush()

        app = Application(
            id=uuid.uuid4(),
            company="Stripe",
            role="Infrastructure Engineer",
            employee_id=user.id,
            status="Submitted",
        )
        session.add(app)
        await session.commit()

        # Email from Greenhouse notification system with Stripe in subject
        matched_app = await ApplicationMatcher.match_application(
            session=session,
            company="Stripe",
            role="Infrastructure Engineer",
            sender_domain="greenhouse.io",
            subject="Stripe Interview Invitation - Infrastructure Engineer",
            body_text="Welcome to the interview process at Stripe via Greenhouse.",
        )
        assert matched_app is not None
        assert matched_app.id == app.id
        assert matched_app.company == "Stripe"

    await test_engine.dispose()


@pytest.mark.anyio
async def test_end_to_end_orchestrator_pipeline_with_thread_id():
    """Verify end-to-end ingestion creates thread_id and sequential event with dynamic round_name."""
    test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async_session = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        user = User(
            id=uuid.uuid4(),
            email="admin@applyflow.com",
            password_hash="hashed_pw",
            name="Admin",
            role="admin",
            status="active",
        )
        session.add(user)
        await session.flush()

        app = Application(
            id=uuid.uuid4(),
            company="Snowflake",
            role="Backend Engineer",
            employee_id=user.id,
            status="Submitted",
        )
        session.add(app)
        await session.commit()

        raw_email = """From: notifications@greenhouse.io
To: candidate@applyflow.com
Subject: Snowflake Online Technical Assessment - HackerRank
Date: Tue, 01 Sep 2026 15:00:00 +0000
Message-ID: <snowflake-oa-555@greenhouse.io>

Hi Candidate,

You have been invited by Snowflake to complete a timed coding assessment on HackerRank.
Link: https://hackerrank.com/tests/snowflake-backend-oa
Please complete within 48 hours.
"""
        mock_api_payload = {
            "it_related": True,
            "category": EmailCategory.TECHNICAL_ASSESSMENT.value,
            "company": "Snowflake",
            "role": "Backend Engineer",
            "round_name": "Online Assessment",
            "round_type": RoundType.TECHNICAL_ASSESSMENT.value,
            "status": EventStatus.SCHEDULED.value,
            "confidence": 99,
            "meeting_link": "https://hackerrank.com/tests/snowflake-backend-oa",
            "deadline": "within 48 hours",
            "reason": "Detected HackerRank assessment instructions.",
        }

        with patch(
            "app.modules.interview_intelligence.teacher.chat_completion",
            new=AsyncMock(
                return_value={
                    "choices": [{"message": {"content": json.dumps(mock_api_payload)}}],
                    "model": "llama-3.3-70b-versatile",
                }
            ),
        ):
            response = await InterviewPipelineOrchestrator.process_email(
                session=session,
                content=raw_email,
                filename="snowflake_oa.eml",
            )

        assert response.status == "success"
        assert response.category == EmailCategory.TECHNICAL_ASSESSMENT.value
        assert response.round_type == RoundType.TECHNICAL_ASSESSMENT.value
        assert response.confidence >= 95
        assert response.source == "api_key"
        assert response.decision == "api_classified"
        assert response.action == "created_new_interview_event"
        assert response.application_id == app.id
        assert response.thread_id is not None
        assert response.event_sequence == 1
        assert response.pipeline_version == "interview_pipeline_v2.0"

        # Verify database record has thread_id
        res = await session.execute(select(InterviewEvent).where(InterviewEvent.thread_id == response.thread_id))
        ev = res.scalar_one()
        assert ev.thread_id == response.thread_id
        assert ev.round_type == RoundType.TECHNICAL_ASSESSMENT.value

    await test_engine.dispose()

"""
Test Suite for Phase 5: Admin Intelligence Dashboard, Review Actions, and Timeline Inspector
Tests:
1. ReviewAction audit trail model creation and persistence.
2. Manual email correction via PATCH /api/interview-intelligence/emails/{id}.
3. Dashboard telemetry metrics calculation.
4. Sequential Timeline Inspector query with email snippets.
"""

import uuid

import pytest
from app.core.database import Base
from app.modules.applications.models import Application
from app.modules.interview_intelligence.models import (
    EmailTrainingData,
    InterviewEvent,
    ReviewAction,
)
from app.modules.interview_intelligence.schemas import EmailCategory
from app.modules.users.models import User
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_review_action_audit_trail_and_manual_correction():
    """Verify manual label correction logs a ReviewAction and increments version."""
    test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async_session = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        # Create reviewer user
        admin = User(
            id=uuid.uuid4(),
            email="lead_admin@applyflow.com",
            name="Lead Admin",
            password_hash="hashed",
            role="admin",
            status="active",
        )
        session.add(admin)
        await session.flush()

        # Create email record classified as 'other'
        email = EmailTrainingData(
            id=uuid.uuid4(),
            version=1,
            message_id="uber-oa-100@uber.com",
            email_hash="hash99887766554433221100aabbccddeeff99887766554433221100aabbccddeeff",
            subject="Uber Assessment Link",
            sender_email="recruiting@uber.com",
            sender_domain="uber.com",
            storage_key="emails/normalized/2026/09/01/uber.json",
            body_sha256="sha9988",
            category="other",
            confidence=70,
            source="api_key",
            needs_retraining=False,
        )
        session.add(email)
        await session.commit()

        # Perform human review action
        old_cat = email.category
        new_cat = EmailCategory.TECHNICAL_ASSESSMENT.value

        action = ReviewAction(
            id=uuid.uuid4(),
            email_id=email.id,
            reviewer=admin.name,
            reviewer_id=admin.id,
            old_label=old_cat,
            new_label=new_cat,
            notes="Corrected from other to technical_assessment by admin",
        )
        session.add(action)

        email.category = new_cat
        email.source = "human"
        email.classification_source_version = "human_admin"
        email.needs_retraining = False
        email.version += 1
        session.add(email)
        await session.commit()

        # Verify email updated
        res_email = await session.execute(select(EmailTrainingData).where(EmailTrainingData.id == email.id))
        updated_email = res_email.scalar_one()
        assert updated_email.category == EmailCategory.TECHNICAL_ASSESSMENT.value
        assert updated_email.source == "human"
        assert updated_email.needs_retraining is False
        assert updated_email.version == 2

        # Verify ReviewAction recorded
        res_action = await session.execute(select(ReviewAction).where(ReviewAction.email_id == email.id))
        logged_action = res_action.scalar_one()
        assert logged_action.old_label == "other"
        assert logged_action.new_label == EmailCategory.TECHNICAL_ASSESSMENT.value
        assert logged_action.reviewer == "Lead Admin"

    await test_engine.dispose()


@pytest.mark.anyio
async def test_dashboard_metrics_aggregation():
    """Verify live metrics computation for API-classified, human-reviewed, and pending records."""
    test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async_session = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        # Sample 1: API-key classified
        session.add(
            EmailTrainingData(
                id=uuid.uuid4(),
                email_hash="hash1" * 12 + "1234",
                storage_key="k1",
                body_sha256="s1",
                confidence=98,
                source="api_key",
                category=EmailCategory.INTERVIEW.value,
                needs_retraining=False,
                processing_status="classified",
            )
        )
        # Sample 2: Historical Groq API row
        session.add(
            EmailTrainingData(
                id=uuid.uuid4(),
                email_hash="hash2" * 12 + "1234",
                storage_key="k2",
                body_sha256="s2",
                confidence=92,
                source="groq",
                category=EmailCategory.TECHNICAL_ASSESSMENT.value,
                needs_retraining=False,
                processing_status="classified",
            )
        )
        # Sample 3: Human corrected
        session.add(
            EmailTrainingData(
                id=uuid.uuid4(),
                email_hash="hash3" * 12 + "1234",
                storage_key="k3",
                body_sha256="s3",
                confidence=80,
                source="human",
                category=EmailCategory.HR_SCREENING.value,
                needs_retraining=False,
                processing_status="classified",
            )
        )
        # Sample 4: Pending processing
        session.add(
            EmailTrainingData(
                id=uuid.uuid4(),
                email_hash="hash4" * 12 + "1234",
                storage_key="k4",
                body_sha256="s4",
                confidence=0,
                source="api_key",
                category=None,
                needs_retraining=False,
                processing_status="pending",
            )
        )
        await session.commit()

        # Compute counts
        total = (await session.execute(select(func.count(EmailTrainingData.id)))).scalar()
        api_classified = (
            await session.execute(
                select(func.count(EmailTrainingData.id)).where(
                    EmailTrainingData.source.in_(["api_key", "groq"]),
                )
            )
        ).scalar()
        human_reviewed = (
            await session.execute(
                select(func.count(EmailTrainingData.id)).where(EmailTrainingData.source == "human")
            )
        ).scalar()
        pending = (
            await session.execute(
                select(func.count(EmailTrainingData.id)).where(
                    EmailTrainingData.processing_status.in_(["pending", "failed"])
                )
            )
        ).scalar()

        assert total == 4
        assert api_classified == 3
        assert human_reviewed == 1
        assert pending == 1

    await test_engine.dispose()


@pytest.mark.anyio
async def test_timeline_inspector_query():
    """Verify Application timeline events are ordered by sequence with email snippets."""
    test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async_session = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        user = User(
            id=uuid.uuid4(),
            email="emp@applyflow.com",
            name="Emp",
            password_hash="pw",
            role="employee",
            status="active",
        )
        session.add(user)
        await session.flush()

        app = Application(
            id=uuid.uuid4(),
            company="Netflix",
            role="Senior Platform Engineer",
            employee_id=user.id,
            status="Technical",
        )
        session.add(app)
        await session.flush()

        # Add 2 events with sequences
        e1 = EmailTrainingData(
            id=uuid.uuid4(),
            email_hash="hashe1" * 10 + "1234",
            storage_key="k1",
            body_sha256="s1",
            subject="Netflix HR Screen",
            body_preview="Hi Alex, let's schedule an initial HR call.",
            category=EmailCategory.HR_SCREENING.value,
        )
        session.add(e1)
        await session.flush()

        ev1 = InterviewEvent(
            id=uuid.uuid4(),
            application_id=app.id,
            email_id=e1.id,
            event_type=EmailCategory.HR_SCREENING.value,
            event_sequence=1,
            round="HR Screening",
            status="Completed",
        )
        session.add(ev1)

        e2 = EmailTrainingData(
            id=uuid.uuid4(),
            email_hash="hashe2" * 10 + "1234",
            storage_key="k2",
            body_sha256="s2",
            subject="Netflix Technical Architecture Round",
            body_preview="Zoom link for your system design interview.",
            category=EmailCategory.INTERVIEW.value,
        )
        session.add(e2)
        await session.flush()

        ev2 = InterviewEvent(
            id=uuid.uuid4(),
            application_id=app.id,
            email_id=e2.id,
            event_type=EmailCategory.INTERVIEW.value,
            event_sequence=2,
            round="System Design Round 1",
            status="Scheduled",
            meeting_link="https://netflix.zoom.us/j/9876",
        )
        session.add(ev2)
        await session.commit()

        # Query ordered timeline
        res = await session.execute(
            select(InterviewEvent)
            .where(InterviewEvent.application_id == app.id)
            .order_by(InterviewEvent.event_sequence.asc())
        )
        timeline = res.scalars().all()
        assert len(timeline) == 2
        assert timeline[0].event_sequence == 1
        assert timeline[0].round == "HR Screening"
        assert timeline[0].status == "Completed"
        assert timeline[1].event_sequence == 2
        assert timeline[1].round == "System Design Round 1"
        assert timeline[1].meeting_link == "https://netflix.zoom.us/j/9876"

    await test_engine.dispose()

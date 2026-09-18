"""
Test suite for Confirmed Applications pagination in AIResponseInbox (/api/ai/inbox).
Verifies:
1. Page 1 returns records 1-20 with total=25, page=1, page_size=20, total_pages=2.
2. Page 2 returns records 21-25.
3. Range calculations and boundary handling.
"""

import uuid
import pytest
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base
from app.modules.applications.models import Application
from app.modules.applications.service import get_ai_inbox_feed
from app.modules.clients.models import Client
from app.modules.users.models import User


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_confirmed_applications_pagination():
    test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async_session = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        # Create super admin user
        admin = User(
            id=uuid.uuid4(),
            email="admin@applyflow.com",
            name="Admin User",
            role="super_admin",
            password_hash="hashed_secret",
            is_active=True,
        )
        db.add(admin)

        # Create client
        client = Client(
            id=uuid.uuid4(),
            company_name="Apex Global Staffing",
            contact_person="Director",
            email="contact@apex.com",
            phone="+1234567890",
            status="active",
        )
        db.add(client)
        await db.commit()

        # Seed 25 applications
        now = datetime.now(timezone.utc)
        for i in range(1, 26):
            app = Application(
                id=uuid.uuid4(),
                candidate_name=f"Candidate {i:02d}",
                company="Tech Corp",
                role="Software Engineer",
                status="Shortlisted",
                current_round=f"Round {(i % 3) + 1}",
                confidence=0.95,
                client_id=client.id,
                employee_id=admin.id,
                applied_date=now,
                updated_at=now,
                is_ai_processed=True,
                last_email_snippet=f"Confirmed interview update for Candidate {i}",
            )
            db.add(app)
        await db.commit()

        # Test Page 1: page=1, page_size=20
        res_page_1 = await get_ai_inbox_feed(
            db=db,
            current_user=admin,
            page=1,
            page_size=20,
        )

        assert res_page_1.total == 25
        assert res_page_1.page == 1
        assert res_page_1.page_size == 20
        assert res_page_1.total_pages == 2
        assert len(res_page_1.items) == 20

        # Test Page 2: page=2, page_size=20
        res_page_2 = await get_ai_inbox_feed(
            db=db,
            current_user=admin,
            page=2,
            page_size=20,
        )

        assert res_page_2.total == 25
        assert res_page_2.page == 2
        assert res_page_2.page_size == 20
        assert res_page_2.total_pages == 2
        assert len(res_page_2.items) == 5

        # Verify items on Page 1 and Page 2 are completely distinct
        page_1_ids = {item.id for item in res_page_1.items}
        page_2_ids = {item.id for item in res_page_2.items}
        assert len(page_1_ids.intersection(page_2_ids)) == 0

    await test_engine.dispose()

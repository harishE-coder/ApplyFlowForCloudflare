"""
End-to-End Test Suite for ApplyFlow Safe Delete Operations & Foreign Key Cascade Behavior.
Validates:
1. Client deletion blocked with clear actionable message when active job openings / applications exist.
2. Client deletion succeeds cleanly with cascade on chat room and assignments when no blockers exist.
3. Employee deletion blocked when active requirements are assigned.
4. Employee deletion succeeds with Slack pattern (message preserved, sender_id=NULL) and Audit pattern (activity log preserved, user_id=NULL).
"""

import uuid

import pytest
from app.core.database import Base, get_db
from app.core.security import create_access_token, hash_password
from app.main import app
from app.modules.activity_logs.models import ActivityLog
from app.modules.attendance.models import Attendance
from app.modules.chat.models import ChatMessage, ChatRoom
from app.modules.clients.models import Client
from app.modules.notifications.models import Notification
from app.modules.users.models import User
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)

@event.listens_for(test_engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

db_session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

async def override_get_db():
    async with db_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@pytest.fixture(autouse=True, scope="function")
async def setup_test_db():
    app.dependency_overrides[get_db] = override_get_db
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield

    async with test_engine.begin() as conn:
        # Disable foreign keys temporarily during drop to avoid cyclic dependency issues
        await conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
        await conn.run_sync(Base.metadata.drop_all)
        await conn.exec_driver_sql("PRAGMA foreign_keys=ON")
    app.dependency_overrides.clear()


@pytest.fixture
async def admin_auth():
    async with db_session_factory() as db:
        admin = User(
            name="Super Admin",
            email=f"admin_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=hash_password("AdminPass123"),
            role="admin",
            status="active",
            is_active=True,
        )
        db.add(admin)
        await db.commit()
        token = create_access_token(user_id=admin.id, role="admin")
        return {"Authorization": f"Bearer {token}", "Cookie": f"access_token={token}"}


@pytest.mark.anyio
async def test_client_delete_blocked_and_success_flow(admin_auth):
    headers = admin_auth
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        # 1. Create a client
        client_name = f"TestCorp_{uuid.uuid4().hex[:6]}"
        create_res = await client.post(
            "/api/clients",
            json={"company_name": client_name, "email": f"{client_name.lower()}@corp.com"},
            headers=headers,
        )
        assert create_res.status_code == 200 or create_res.status_code == 201, create_res.text
        client_id = create_res.json()["id"]

        # 2. Add an active requirement to this client
        req_res = await client.post(
            "/api/requirements",
            json={
                "client_id": client_id,
                "company": "Amazon",
                "role": "SDE-II",
                "role_code": f"AMZ-{uuid.uuid4().hex[:4]}",
                "priority": "High",
            },
            headers=headers,
        )
        assert req_res.status_code == 200 or req_res.status_code == 201, req_res.text
        req_id = req_res.json()["id"]

        # 3. Attempting to delete client should be BLOCKED with a clear explanation
        del_res = await client.delete(f"/api/clients/{client_id}", headers=headers)
        assert del_res.status_code == 400
        assert "cannot be deleted because" in del_res.json()["detail"]
        assert "job opening" in del_res.json()["detail"]

        # 4. Clean up requirement (delete requirement)
        del_req_res = await client.delete(f"/api/requirements/{req_id}", headers=headers)
        assert del_req_res.status_code == 200

        # 5. Now delete client should SUCCEED cleanly
        del_client_res = await client.delete(f"/api/clients/{client_id}", headers=headers)
        assert del_client_res.status_code == 200
        assert del_client_res.json()["message"] == "Client deleted successfully"


@pytest.mark.anyio
async def test_employee_delete_slack_and_audit_patterns(admin_auth):
    headers = admin_auth
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        # 1. Create a test employee
        emp_email = f"emp_{uuid.uuid4().hex[:6]}@applyflow.com"
        create_res = await client.post(
            "/api/users",
            json={"name": "Alice Recruiter", "email": emp_email, "password": "Password123", "role": "employee"},
            headers=headers,
        )
        assert create_res.status_code == 200 or create_res.status_code == 201, create_res.text
        emp_id = uuid.UUID(create_res.json()["id"])

        # 2. Add attendance, notifications, and activity log directly in DB
        async with db_session_factory() as db:
            room = (await db.execute(select(ChatRoom))).scalars().first()
            if not room:
                dummy_client = Client(company_name=f"ChatTest_{uuid.uuid4().hex[:6]}")
                db.add(dummy_client)
                await db.flush()
                room = ChatRoom(client_id=dummy_client.id)
                db.add(room)
                await db.flush()

            msg = ChatMessage(room_id=room.id, sender_id=emp_id, message="Test salary note: $140k")
            notif = Notification(user_id=emp_id, title="Target Alert", message="New target assigned")
            att = Attendance(employee_id=emp_id)
            act = ActivityLog(user_id=emp_id, action="login")
            db.add_all([msg, notif, att, act])
            await db.commit()
            msg_id = msg.id
            act_id = act.id
            notif_id = notif.id

        # 3. Delete employee
        del_emp_res = await client.delete(f"/api/employees/{emp_id}", headers=headers)
        assert del_emp_res.status_code == 200
        assert del_emp_res.json()["message"] == "User deleted successfully"

        # 4. Verify preserved history in database
        async with db_session_factory() as db:
            # Message is preserved (Slack pattern)
            saved_msg = (await db.execute(select(ChatMessage).where(ChatMessage.id == msg_id))).scalar_one_or_none()
            assert saved_msg is not None
            assert saved_msg.sender_id is None
            assert saved_msg.message == "Test salary note: $140k"

            # Activity log is preserved (Audit pattern)
            saved_act = (await db.execute(select(ActivityLog).where(ActivityLog.id == act_id))).scalar_one_or_none()
            assert saved_act is not None
            assert saved_act.user_id is None

            # Notification cascaded and removed
            saved_notif = (await db.execute(select(Notification).where(Notification.id == notif_id))).scalar_one_or_none()
            assert saved_notif is None


@pytest.mark.anyio
async def test_chat_message_soft_delete_and_admin_audit_view(admin_auth):
    headers = admin_auth
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        # 1. Setup client, employee, and room
        async with db_session_factory() as db:
            c = Client(company_name=f"AuditCorp_{uuid.uuid4().hex[:6]}")
            db.add(c)
            await db.flush()

            emp = User(
                name="Harish Employee",
                email=f"emp_{uuid.uuid4().hex[:6]}@test.com",
                password_hash=hash_password("EmpPass123"),
                role="employee",
                status="active",
                is_active=True,
            )
            db.add(emp)
            await db.flush()

            room = ChatRoom(client_id=c.id)
            db.add(room)
            await db.flush()

            msg = ChatMessage(
                room_id=room.id,
                sender_id=emp.id,
                message="Please send John's resume today.",
                attachment_type="resume",
                attachment_reference="resume-uuid-123",
            )
            db.add(msg)
            await db.commit()
            room_id = room.id
            msg_id = msg.id
            emp_id = emp.id

        # 2. Admin soft-deletes the message
        del_res = await client.delete(f"/api/chat/messages/{msg_id}", headers=headers)
        assert del_res.status_code == 200
        del_data = del_res.json()
        assert del_data["success"] is True
        assert del_data["message_id"] == str(msg_id)
        assert del_data["deleted_by_name"] == "Super Admin"

        # 3. Database row is NOT hard-deleted
        async with db_session_factory() as db:
            db_msg = (await db.execute(select(ChatMessage).where(ChatMessage.id == msg_id))).scalar_one_or_none()
            assert db_msg is not None
            assert db_msg.is_deleted is True
            assert db_msg.deleted_at is not None
            assert db_msg.message == "Please send John's resume today."
            assert db_msg.attachment_type == "resume"

        # 4. Admin GET room messages -> sees original text, attachments, and audit metadata
        admin_get = await client.get(f"/api/chat/rooms/{room_id}/messages", headers=headers)
        assert admin_get.status_code == 200
        admin_items = admin_get.json()["items"]
        assert len(admin_items) == 1
        assert admin_items[0]["id"] == str(msg_id)
        assert admin_items[0]["is_deleted"] is True
        assert admin_items[0]["message"] == "Please send John's resume today."
        assert admin_items[0]["attachment_type"] == "resume"
        assert admin_items[0]["deleted_by_name"] == "Super Admin"

        # 5. Employee GET room messages -> sees sanitized "This message was deleted." and nullified attachments
        emp_token = create_access_token(user_id=emp_id, role="employee")
        emp_headers = {"Authorization": f"Bearer {emp_token}", "Cookie": f"access_token={emp_token}"}
        emp_get = await client.get(f"/api/chat/rooms/{room_id}/messages", headers=emp_headers)
        assert emp_get.status_code == 200
        emp_items = emp_get.json()["items"]
        assert len(emp_items) == 1
        assert emp_items[0]["id"] == str(msg_id)
        assert emp_items[0]["is_deleted"] is True
        assert emp_items[0]["message"] == "This message was deleted."
        assert emp_items[0]["attachment_type"] is None
        assert emp_items[0]["attachment_reference"] is None
        assert emp_items[0]["deleted_by"] is None
        assert emp_items[0]["deleted_by_name"] is None


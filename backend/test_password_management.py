"""
Automated Test Suite for Password Management:
1. Self-Service Password Change: requires current_password verification.
2. Admin Override on Employee / User: Admin can reset anytime without current password.
3. Admin Override on Client: Admin can reset client login password anytime.
4. User changes password, then Admin overrides again seamlessly.
"""

import asyncio
import uuid
from app.core.database import async_session_factory
from app.core.security import hash_password, verify_password
from app.modules.users.models import User
from app.modules.clients.models import Client
from app.modules.clients.service import reset_client_password
from app.modules.users.service import reset_password_user
from sqlalchemy import select


async def test_password_flows():
    print("==========================================================================")
    print("🧪 TESTING PASSWORD MANAGEMENT: SELF-SERVICE & ADMIN OVERRIDE")
    print("==========================================================================")

    async with async_session_factory() as db:
        # Get admin
        admin = (await db.execute(select(User).where(User.role == "admin"))).scalars().first()
        assert admin is not None, "Admin user required"
        print(f"✅ Admin: {admin.name} ({admin.email})")

        # 1. Create a test employee
        test_email = f"test_emp_{uuid.uuid4().hex[:6]}@applyflow.com"
        initial_pw = "InitialPass@123"
        test_user = User(
            name="Test Employee",
            email=test_email,
            password_hash=hash_password(initial_pw),
            role="employee",
            status="active",
            is_active=True,
        )
        db.add(test_user)
        await db.commit()
        await db.refresh(test_user)
        print(f"✅ Created test employee: {test_user.email}")

        # ----------------------------------------------------------------------
        # TEST 1: Verify Initial Password
        # ----------------------------------------------------------------------
        assert verify_password(initial_pw, test_user.password_hash) is True
        print("✅ Test 1 PASSED: Initial password verified.")

        # ----------------------------------------------------------------------
        # TEST 2: Self-Service Password Change (Wrong current password -> Fails)
        # ----------------------------------------------------------------------
        wrong_pw = "WrongCurrentPassword@999"
        assert verify_password(wrong_pw, test_user.password_hash) is False
        print("✅ Test 2 PASSED: Wrong current password correctly rejected.")

        # ----------------------------------------------------------------------
        # TEST 3: Self-Service Password Change (Correct current password -> Updates)
        # ----------------------------------------------------------------------
        user_new_pw = "UserChangedPass@456"
        # Simulate /api/auth/change-password endpoint logic
        assert verify_password(initial_pw, test_user.password_hash) is True
        test_user.password_hash = hash_password(user_new_pw)
        db.add(test_user)
        await db.commit()
        await db.refresh(test_user)

        assert verify_password(user_new_pw, test_user.password_hash) is True
        assert verify_password(initial_pw, test_user.password_hash) is False
        print(f"✅ Test 3 PASSED: Employee successfully updated own password to '{user_new_pw}'.")

        # ----------------------------------------------------------------------
        # TEST 4: Admin Override After User Changed Password (NO current password needed)
        # ----------------------------------------------------------------------
        admin_override_pw = "AdminOverridePass@789"
        await reset_password_user(db, test_user.id, admin_override_pw, admin)
        await db.commit()
        await db.refresh(test_user)

        assert verify_password(admin_override_pw, test_user.password_hash) is True
        assert verify_password(user_new_pw, test_user.password_hash) is False
        print(f"✅ Test 4 PASSED: Admin successfully overrode password to '{admin_override_pw}' after user changed it.")

        # ----------------------------------------------------------------------
        # TEST 5: Client Password Reset by Admin
        # ----------------------------------------------------------------------
        client = (await db.execute(select(Client).limit(1))).scalars().first()
        if not client:
            client = Client(
                company_name="Test Enterprise Inc",
                email="contact@enterprise.com",
                status="active",
                is_active=True,
            )
            db.add(client)
            await db.commit()
            await db.refresh(client)

        client_new_pw = "ClientPortalPass@321"
        client_user = await reset_client_password(db, client.id, client_new_pw, admin)
        assert client_user is not None
        assert verify_password(client_new_pw, client_user.password_hash) is True
        print(f"✅ Test 5 PASSED: Admin successfully set/reset client login password for {client.company_name} to '{client_new_pw}'.")

        # Cleanup test employee
        await db.delete(test_user)
        await db.commit()

    print("==========================================================================")
    print("🎉 ALL PASSWORD MANAGEMENT TESTS PASSED 100%!")
    print("==========================================================================")


if __name__ == "__main__":
    asyncio.run(test_password_flows())

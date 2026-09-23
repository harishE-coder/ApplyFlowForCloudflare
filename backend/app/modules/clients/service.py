import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.modules.activity_logs.models import ActivityLog
from app.modules.applications.models import Application
from app.modules.chat.models import ChatMessage, ChatRoom, ChatRoomAccessAudit
from app.modules.clients.models import Client, EmployeeClient
from app.modules.clients.schemas import (
    AssignedEmployeeInfo,
    ClientCreate,
    ClientResponse,
    ClientUpdate,
)
from app.modules.requirements.models import Requirement
from app.modules.resumes.models import Resume
from app.modules.targets.models import Target
from app.modules.users.models import SubAdminAssignment, User
from app.modules.users.service import (
    get_sub_admin_client_ids,
    get_sub_admin_employee_ids,
)


async def get_clients(
    db: AsyncSession,
    current_user: User,
    status_filter: str | None = None,
) -> list[ClientResponse]:
    query = select(Client).order_by(Client.company_name)

    if status_filter and status_filter != "all":
        query = query.where(Client.status == status_filter)
    elif not status_filter:
        # Default view shows active clients
        query = query.where(Client.status != "archived")

    if current_user.role == "sub_admin":
        allowed_cids = await get_sub_admin_client_ids(db, current_user.id)
        query = query.where(Client.id.in_(allowed_cids))
    elif current_user.role == "employee":
        subquery = (
            select(EmployeeClient.client_id)
            .where(
                EmployeeClient.employee_id == current_user.id,
                EmployeeClient.active == True,
            )
        )
        emp_cids = (await db.execute(subquery)).scalars().all()
        if emp_cids:
            query = query.where(Client.id.in_(emp_cids))
        else:
            query = query.where(Client.status == "active")
    elif current_user.role == "client":
        if current_user.client_id:
            query = query.where(Client.id == current_user.client_id)
        else:
            return []

    result = await db.execute(query)
    clients = result.scalars().all()

    if not clients:
        return []

    client_ids = [c.id for c in clients]

    # Pre-fetch 1: assigned employees for all clients in 1 query
    emp_query = (
        select(EmployeeClient.client_id, User.id, User.name, User.email, EmployeeClient.is_primary, EmployeeClient.active, EmployeeClient.assigned_at)
        .join(User, EmployeeClient.employee_id == User.id)
        .where(EmployeeClient.client_id.in_(client_ids), User.is_active == True)
        .order_by(EmployeeClient.is_primary.desc(), User.name)
    )
    emp_res = await db.execute(emp_query)
    emp_map = {}
    for cid, uid, uname, uemail, is_prim, act, assigned_at in emp_res.all():
        emp_map.setdefault(cid, []).append(
            AssignedEmployeeInfo(
                id=uid,
                name=uname,
                email=uemail,
                is_primary=is_prim,
                active=act,
                assigned_at=assigned_at,
            )
        )

    # Pre-fetch 2: Total Requirements count in 1 query
    req_total_map = dict(
        (await db.execute(
            select(Requirement.client_id, func.count(Requirement.id))
            .where(Requirement.client_id.in_(client_ids))
            .group_by(Requirement.client_id)
        )).all()
    )

    # Pre-fetch 3: Active Requirements count in 1 query
    req_active_map = dict(
        (await db.execute(
            select(Requirement.client_id, func.count(Requirement.id))
            .where(Requirement.client_id.in_(client_ids), Requirement.status == "active")
            .group_by(Requirement.client_id)
        )).all()
    )

    # Pre-fetch 4: Total Resumes count in 1 query
    resumes_count_map = dict(
        (await db.execute(
            select(Resume.client_id, func.count(Resume.id))
            .where(Resume.client_id.in_(client_ids))
            .group_by(Resume.client_id)
        )).all()
    )

    # Pre-fetch 5: Total Applications count in 1 query
    apps_count_map = dict(
        (await db.execute(
            select(Application.client_id, func.count(Application.id))
            .where(Application.client_id.in_(client_ids))
            .group_by(Application.client_id)
        )).all()
    )

    response_list = [
        ClientResponse(
            id=client.id,
            company_name=client.company_name,
            contact_person=client.contact_person,
            email=client.email,
            phone=client.phone,
            status=client.status,
            logo_url=client.logo_url,
            is_active=client.is_active,
            deactivated_at=client.deactivated_at,
            archived_at=client.archived_at,
            created_at=client.created_at,
            assigned_employees=emp_map.get(client.id, []),
            total_requirements=req_total_map.get(client.id, 0),
            active_requirements=req_active_map.get(client.id, 0),
            total_resumes=resumes_count_map.get(client.id, 0),
            total_applications=apps_count_map.get(client.id, 0),
        )
        for client in clients
    ]

    return response_list


async def get_client_by_id(db: AsyncSession, client_id: uuid.UUID) -> Client | None:
    result = await db.execute(select(Client).where(Client.id == client_id))
    return result.scalar_one_or_none()


async def create_client(db: AsyncSession, payload: ClientCreate, current_user: User | None = None) -> Client:
    existing = await db.execute(
        select(Client).where(Client.company_name == payload.company_name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Client '{payload.company_name}' already exists.",
        )

    client = Client(
        company_name=payload.company_name,
        contact_person=payload.contact_person,
        email=payload.email,
        phone=payload.phone,
        status=payload.status or "active",
        logo_url=payload.logo_url,
        is_active=True,
    )
    if current_user and current_user.role == "sub_admin":
        client.managed_by = current_user.id

    db.add(client)
    await db.flush()

    login_email = (payload.email or "").strip().lower()
    login_password = (payload.password or "").strip()
    if login_email and login_password:
        existing_client_user = (await db.execute(
            select(User).where(User.email == login_email, User.role == "client")
        )).scalar_one_or_none()
        if existing_client_user is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A client login account already exists for {login_email}.",
            )

        client_user = User(
            name=(payload.contact_person or payload.company_name).strip() or payload.company_name,
            email=login_email,
            phone=payload.phone,
            password_hash=hash_password(login_password),
            role="client",
            status="active",
            client_id=client.id,
            is_active=True,
        )
        db.add(client_user)
        await db.flush()

    # Create associated Chat Room
    chat_room = ChatRoom(client_id=client.id, status="active")
    db.add(chat_room)
    await db.flush()

    # Auto-assign to Sub-Admin if created by Sub-Admin
    if current_user and current_user.role == "sub_admin":
        assignment = SubAdminAssignment(
            sub_admin_id=current_user.id,
            client_id=client.id,
            active=True,
        )
        db.add(assignment)
        await db.flush()

    if current_user:
        db.add(
            ActivityLog(
                user_id=current_user.id,
                action="client_created",
                details={"client_id": str(client.id), "company_name": client.company_name},
            )
        )

    return client


async def update_client(
    db: AsyncSession,
    client_id: uuid.UUID,
    payload: ClientUpdate,
    current_user: User | None = None,
) -> Client:
    client = await get_client_by_id(db, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    if current_user and current_user.role == "sub_admin":
        allowed_cids = await get_sub_admin_client_ids(db, current_user.id)
        if client.id not in allowed_cids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to edit this client.",
            )

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(client, field, value)

    await db.flush()

    if current_user:
        db.add(
            ActivityLog(
                user_id=current_user.id,
                action="client_updated",
                details={"client_id": str(client.id), "company_name": client.company_name},
            )
        )

    return client


async def activate_client(
    db: AsyncSession,
    client_id: uuid.UUID,
    current_user: User,
) -> Client:
    client = await get_client_by_id(db, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    if current_user.role == "sub_admin":
        allowed_cids = await get_sub_admin_client_ids(db, current_user.id)
        if client.id not in allowed_cids:
            raise HTTPException(status_code=403, detail="Forbidden")

    client.status = "active"
    client.is_active = True

    # Reactivate chat room
    room = (await db.execute(select(ChatRoom).where(ChatRoom.client_id == client.id))).scalar_one_or_none()
    if room:
        room.status = "active"

    db.add(
        ActivityLog(
            user_id=current_user.id,
            action="client_activated",
            details={"client_id": str(client.id), "company_name": client.company_name},
        )
    )
    await db.flush()
    return client


async def deactivate_client(
    db: AsyncSession,
    client_id: uuid.UUID,
    current_user: User,
) -> Client:
    client = await get_client_by_id(db, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    if current_user.role == "sub_admin":
        allowed_cids = await get_sub_admin_client_ids(db, current_user.id)
        if client.id not in allowed_cids:
            raise HTTPException(status_code=403, detail="Forbidden")

    client.status = "inactive"
    client.is_active = False
    client.deactivated_at = datetime.now(timezone.utc)

    # Set chat room to read_only
    room = (await db.execute(select(ChatRoom).where(ChatRoom.client_id == client.id))).scalar_one_or_none()
    if room:
        room.status = "read_only"

    db.add(
        ActivityLog(
            user_id=current_user.id,
            action="client_deactivated",
            details={"client_id": str(client.id), "company_name": client.company_name},
        )
    )
    await db.flush()
    return client


async def archive_client(
    db: AsyncSession,
    client_id: uuid.UUID,
    current_user: User,
) -> Client:
    client = await get_client_by_id(db, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    if current_user.role == "sub_admin":
        allowed_cids = await get_sub_admin_client_ids(db, current_user.id)
        if client.id not in allowed_cids:
            raise HTTPException(status_code=403, detail="Forbidden")

    client.status = "archived"
    client.is_active = False
    client.archived_at = datetime.now(timezone.utc)

    db.add(
        ActivityLog(
            user_id=current_user.id,
            action="client_archived",
            details={"client_id": str(client.id), "company_name": client.company_name},
        )
    )
    await db.flush()
    return client


async def safe_delete_client(
    db: AsyncSession,
    client_id: uuid.UUID,
    current_user: User,
) -> None:
    """
    Safe Delete: Admin only.
    Allowed only if no resumes, applications, targets, or chats exist.
    Otherwise raises HTTPException(400, "This client has historical data. Archive instead.")
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only Super Admin can delete clients")

    client = await get_client_by_id(db, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Check dependencies
    req_count = (await db.execute(select(func.count(Requirement.id)).where(Requirement.client_id == client_id))).scalar() or 0
    res_count = (await db.execute(select(func.count(Resume.id)).where(Resume.client_id == client_id))).scalar() or 0
    app_count = (await db.execute(select(func.count(Application.id)).where(Application.client_id == client_id))).scalar() or 0
    target_count = (await db.execute(select(func.count(Target.id)).where(Target.client_id == client_id))).scalar() or 0

    room = (await db.execute(select(ChatRoom).where(ChatRoom.client_id == client_id))).scalar_one_or_none()
    chat_count = 0
    if room:
        chat_count = (await db.execute(select(func.count(ChatMessage.id)).where(ChatMessage.room_id == room.id))).scalar() or 0

    reasons = []
    if req_count > 0:
        reasons.append(f"{req_count} job opening(s)")
    if app_count > 0:
        reasons.append(f"{app_count} candidate application(s)")
    if res_count > 0:
        reasons.append(f"{res_count} resume(s)")
    if chat_count > 0:
        reasons.append(f"{chat_count} chat message(s)")
    if target_count > 0:
        reasons.append(f"{target_count} target quota(s)")

    if reasons:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Client '{client.company_name}' cannot be deleted because {', '.join(reasons)} are linked. Archive the client or remove linked requirements first.",
        )

    # Safe to delete - cascade will clean up owned chat rooms, assignments, and employee mappings
    if room:
        await db.delete(room)

    await db.execute(delete(EmployeeClient).where(EmployeeClient.client_id == client_id))
    await db.execute(delete(SubAdminAssignment).where(SubAdminAssignment.client_id == client_id))
    await db.delete(client)

    db.add(
        ActivityLog(
            user_id=current_user.id,
            action="client_deleted",
            details={"client_id": str(client_id), "company_name": client.company_name},
        )
    )
    await db.flush()


async def assign_employees_to_client(
    db: AsyncSession,
    client_id: uuid.UUID,
    employee_ids: list[uuid.UUID] | None = None,
    assignments: list | None = None,
    current_user: User | None = None,
) -> None:
    if current_user and current_user.role == "sub_admin":
        allowed_cids = await get_sub_admin_client_ids(db, current_user.id)
        if client_id not in allowed_cids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot assign employees to a client outside your management scope.",
            )
        allowed_eids = await get_sub_admin_employee_ids(db, current_user.id)
        check_eids = employee_ids or ([a.employee_id if hasattr(a, "employee_id") else a.get("employee_id") for a in (assignments or [])])
        for eid in check_eids:
            if eid not in allowed_eids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cannot assign employee outside your management scope.",
                )

    await db.execute(
        delete(EmployeeClient).where(EmployeeClient.client_id == client_id)
    )

    if assignments:
        for item in assignments:
            emp_id = item.employee_id if hasattr(item, "employee_id") else item.get("employee_id")
            is_prim = item.is_primary if hasattr(item, "is_primary") else item.get("is_primary", False)
            act = item.active if hasattr(item, "active") else item.get("active", True)
            mapping = EmployeeClient(
                client_id=client_id,
                employee_id=emp_id,
                is_primary=is_prim,
                active=act,
            )
            db.add(mapping)
    elif employee_ids:
        for idx, emp_id in enumerate(employee_ids):
            mapping = EmployeeClient(
                client_id=client_id,
                employee_id=emp_id,
                is_primary=(idx == 0),
                active=True,
            )
            db.add(mapping)

    await db.flush()

    # Log audit in chat_room_access_audit
    room = (
        await db.execute(select(ChatRoom).where(ChatRoom.client_id == client_id))
    ).scalar_one_or_none()
    if room:
        target_ids = []
        if assignments:
            target_ids = [
                (item.employee_id if hasattr(item, "employee_id") else item.get("employee_id"))
                for item in assignments
                if (item.active if hasattr(item, "active") else item.get("active", True))
            ]
        elif employee_ids:
            target_ids = employee_ids

        for eid in target_ids:
            db.add(
                ChatRoomAccessAudit(
                    id=uuid.uuid4(),
                    room_id=room.id,
                    client_id=client_id,
                    user_id=eid,
                    action="assigned",
                    performed_by=current_user.id if current_user else None,
                    created_at=datetime.now(timezone.utc),
                )
            )
        await db.flush()


async def unassign_employee(
    db: AsyncSession, client_id: uuid.UUID, employee_id: uuid.UUID, current_user: User | None = None
) -> None:
    if current_user and current_user.role == "sub_admin":
        allowed_cids = await get_sub_admin_client_ids(db, current_user.id)
        if client_id not in allowed_cids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot modify client outside your management scope.",
            )

    # Soft removal: set active = False
    emp_map = (
        await db.execute(
            select(EmployeeClient).where(
                EmployeeClient.client_id == client_id,
                EmployeeClient.employee_id == employee_id,
            )
        )
    ).scalar_one_or_none()

    if emp_map:
        emp_map.active = False
        room = (
            await db.execute(select(ChatRoom).where(ChatRoom.client_id == client_id))
        ).scalar_one_or_none()
        if room:
            db.add(
                ChatRoomAccessAudit(
                    id=uuid.uuid4(),
                    room_id=room.id,
                    client_id=client_id,
                    user_id=employee_id,
                    action="removed",
                    performed_by=current_user.id if current_user else None,
                    created_at=datetime.now(timezone.utc),
                )
            )
        await db.flush()


async def reset_client_password(
    db: AsyncSession,
    client_id: uuid.UUID,
    new_password: str,
    current_user: User,
) -> User:
    client = await get_client_by_id(db, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    if current_user.role == "sub_admin":
        allowed_cids = await get_sub_admin_client_ids(db, current_user.id)
        if client_id not in allowed_cids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot modify client outside your management scope.",
            )

    new_pw = (new_password or "").strip()
    if len(new_pw) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters long.",
        )

    # Find the user(s) associated with this client
    client_users = (
        await db.execute(
            select(User).where(User.client_id == client_id, User.role == "client")
        )
    ).scalars().all()

    hashed_pw = hash_password(new_pw)

    if client_users:
        for u in client_users:
            u.password_hash = hashed_pw
            u.is_active = True
            u.status = "active"
        target_user = client_users[0]
    else:
        # If no user record exists yet for this client, provision one
        email = (client.email or f"client_{str(client_id)[:8]}@applyflow.com").strip().lower()
        existing_user = (
            await db.execute(select(User).where(User.email == email))
        ).scalars().first()
        if existing_user:
            existing_user.password_hash = hashed_pw
            existing_user.client_id = client_id
            existing_user.role = "client"
            existing_user.is_active = True
            existing_user.status = "active"
            target_user = existing_user
        else:
            new_user = User(
                name=(client.contact_person or client.company_name).strip() or client.company_name,
                email=email,
                phone=client.phone,
                password_hash=hashed_pw,
                role="client",
                status="active",
                client_id=client.id,
                is_active=True,
            )
            db.add(new_user)
            target_user = new_user

    # Invalidate cached session
    from app.core.dependencies import invalidate_user_cache
    invalidate_user_cache(str(target_user.id))

    # Log admin/subadmin activity
    log = ActivityLog(
        id=uuid.uuid4(),
        user_id=current_user.id,
        action="client_password_reset",
        details={
            "client_id": str(client_id),
            "client_name": client.company_name,
            "target_user_email": target_user.email,
        },
        created_at=datetime.now(timezone.utc),
    )
    db.add(log)
    await db.commit()
    return target_user



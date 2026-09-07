import asyncio
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.cache import cache, invalidate_chat_cache
from app.modules.chat.models import ChatMessage, ChatRead, ChatRoom
from app.modules.chat.schemas import (
    ChatMessageResponse,
    ChatMessagesListResponse,
    ChatParticipant,
    ChatRoomResponse,
    ChatRoomsListResponse,
    MessageSender,
    UnreadCountResponse,
)
from app.modules.clients.models import Client, EmployeeClient
from app.modules.resumes.models import Resume
from app.modules.resumes.service import get_allowed_client_ids
from app.modules.users.models import SubAdminAssignment, User


async def check_room_access(db: AsyncSession, user: User, room_id: uuid.UUID) -> ChatRoom:
    room = (
        await db.execute(
            select(ChatRoom)
            .where(ChatRoom.id == room_id)
            .options(selectinload(ChatRoom.client))
        )
    ).scalar_one_or_none()

    if not room:
        raise HTTPException(status_code=404, detail="Chat room not found")

    allowed_cids = await get_allowed_client_ids(db, user)
    if allowed_cids is not None and room.client_id not in allowed_cids:
        raise HTTPException(status_code=403, detail="Forbidden: You do not have access to this client chat room")

    return room


async def get_or_create_room(db: AsyncSession, client_id: uuid.UUID) -> ChatRoom:
    room = (
        await db.execute(
            select(ChatRoom)
            .where(ChatRoom.client_id == client_id)
            .options(selectinload(ChatRoom.client))
        )
    ).scalar_one_or_none()

    if not room:
        room = ChatRoom(id=uuid.uuid4(), client_id=client_id, status="active")
        db.add(room)
        await db.flush()

    return room


async def get_rooms_for_user(db: AsyncSession, user: User) -> ChatRoomsListResponse:
    allowed = await get_allowed_client_ids(db, user)

    # 1. Fetch accessible active clients
    client_q = select(Client).where(Client.is_active == True).order_by(Client.company_name)
    if allowed is not None:
        if not allowed:
            return ChatRoomsListResponse(items=[], total_unread=0)
        client_q = client_q.where(Client.id.in_(allowed))

    clients = (await db.execute(client_q)).scalars().all()
    if not clients:
        return ChatRoomsListResponse(items=[], total_unread=0)

    client_ids = [c.id for c in clients]

    # 2. Get or create chat rooms for each client
    rooms_res = await db.execute(
        select(ChatRoom).where(ChatRoom.client_id.in_(client_ids))
    )
    existing_rooms = rooms_res.scalars().all()
    room_by_cid = {r.client_id: r for r in existing_rooms}

    new_rooms = []
    for c in clients:
        if c.id not in room_by_cid:
            new_r = ChatRoom(id=uuid.uuid4(), client_id=c.id, status="active")
            db.add(new_r)
            new_rooms.append(new_r)
            room_by_cid[c.id] = new_r

    if new_rooms:
        await db.flush()

    all_room_ids = [r.id for r in room_by_cid.values()]

    # 3. Batch query participants
    # Admins
    admins = (await db.execute(select(User).where(User.role == "admin", User.is_active == True))).scalars().all()
    admin_parts = [ChatParticipant(id=a.id, name=a.name, role=a.role, is_primary=False) for a in admins]

    # Sub-Admins
    sa_res = await db.execute(
        select(SubAdminAssignment.client_id, User.id, User.name, User.role)
        .join(User, SubAdminAssignment.sub_admin_id == User.id)
        .where(SubAdminAssignment.client_id.in_(client_ids), SubAdminAssignment.active == True, User.is_active == True)
    )
    sa_map = {}
    for cid, uid, uname, urole in sa_res.all():
        sa_map.setdefault(cid, []).append(ChatParticipant(id=uid, name=uname, role=urole, is_primary=False))

    # Employees
    emp_res = await db.execute(
        select(EmployeeClient.client_id, User.id, User.name, User.role, EmployeeClient.is_primary)
        .join(User, EmployeeClient.employee_id == User.id)
        .where(EmployeeClient.client_id.in_(client_ids), EmployeeClient.active == True, User.is_active == True)
    )
    emp_map = {}
    for cid, uid, uname, urole, is_prim in emp_res.all():
        emp_map.setdefault(cid, []).append(ChatParticipant(id=uid, name=uname, role=urole, is_primary=is_prim))

    # Client users
    cl_res = await db.execute(
        select(User.client_id, User.id, User.name, User.role)
        .where(User.client_id.in_(client_ids), User.role == "client", User.is_active == True)
    )
    cl_map = {}
    for cid, uid, uname, urole in cl_res.all():
        cl_map.setdefault(cid, []).append(ChatParticipant(id=uid, name=uname, role=urole, is_primary=False))

    # 4. Batch query latest message per room
    latest_msg_q = (
        select(ChatMessage)
        .where(ChatMessage.room_id.in_(all_room_ids))
        .options(selectinload(ChatMessage.sender))
        .order_by(ChatMessage.created_at.desc())
    )
    all_msgs = (await db.execute(latest_msg_q)).scalars().all()
    latest_by_room = {}
    for m in all_msgs:
        if m.room_id not in latest_by_room:
            latest_by_room[m.room_id] = m

    # 5. Batch query unread count per room
    reads_res = await db.execute(
        select(ChatRead).where(ChatRead.user_id == user.id, ChatRead.room_id.in_(all_room_ids))
    )
    read_map = {r.room_id: r for r in reads_res.scalars().all()}

    unread_map = {}
    for r_id in all_room_ids:
        r_rec = read_map.get(r_id)
        count_q = select(func.count(ChatMessage.id)).where(
            ChatMessage.room_id == r_id,
            ChatMessage.sender_id != user.id,
        )
        if r_rec and r_rec.last_read_at:
            count_q = count_q.where(ChatMessage.created_at > r_rec.last_read_at)
        unread_cnt = (await db.execute(count_q)).scalar() or 0
        unread_map[r_id] = unread_cnt

    # 6. Build response
    rooms_out = []
    total_unread = 0
    for c in clients:
        room = room_by_cid.get(c.id)
        if not room:
            continue
        unread = unread_map.get(room.id, 0)
        total_unread += unread

        last_m = latest_by_room.get(room.id)
        parts = (
            admin_parts
            + sa_map.get(c.id, [])
            + emp_map.get(c.id, [])
            + cl_map.get(c.id, [])
        )

        rooms_out.append(
            ChatRoomResponse(
                id=room.id,
                client_id=c.id,
                client_name=c.company_name,
                status=room.status or "active",
                participants=parts,
                last_message=last_m.message if last_m else None,
                last_message_sender=last_m.sender.name if (last_m and last_m.sender) else ("Deleted User" if last_m else None),
                last_message_at=last_m.created_at if last_m else None,
                unread_count=unread,
            )
        )

    return ChatRoomsListResponse(items=rooms_out, total_unread=total_unread)


async def get_messages(
    db: AsyncSession, room_id: uuid.UUID, user: User, limit: int = 50, before_id: uuid.UUID | None = None
) -> ChatMessagesListResponse:
    await check_room_access(db, user, room_id)

    query = (
        select(ChatMessage)
        .where(ChatMessage.room_id == room_id)
        .options(
            selectinload(ChatMessage.sender),
            selectinload(ChatMessage.deleted_by_user),
        )
    )

    if before_id:
        cursor_msg = (await db.execute(select(ChatMessage.created_at).where(ChatMessage.id == before_id))).scalar_one_or_none()
        if cursor_msg:
            query = query.where(ChatMessage.created_at < cursor_msg)

    query = query.order_by(ChatMessage.created_at.desc()).limit(limit + 1)
    count_q = select(func.count(ChatMessage.id)).where(ChatMessage.room_id == room_id)
    reads_q = select(ChatRead).where(ChatRead.room_id == room_id, ChatRead.user_id != user.id)

    res_data, res_count, res_reads = await asyncio.gather(
        db.execute(query),
        db.execute(count_q),
        db.execute(reads_q),
    )

    results = res_data.scalars().all()
    has_more = len(results) > limit
    messages = results[:limit]
    other_reads = res_reads.scalars().all()
    max_read_at = max([r.last_read_at for r in other_reads if r.last_read_at], default=None)

    from app.modules.chat.websocket import manager
    room_id_str = str(room_id)
    is_recipient_online = any(uid != str(user.id) for uid in manager.get_online_users(room_id_str)) or any(
        manager.is_user_online(r.user_id) for r in other_reads
    )
    if not is_recipient_online:
        room_obj = (await db.execute(select(ChatRoom).where(ChatRoom.id == room_id))).scalar_one_or_none()
        if room_obj and room_obj.client_id:
            assigned = (await db.execute(
                select(EmployeeClient.employee_id).where(EmployeeClient.client_id == room_obj.client_id)
            )).scalars().all()
            client_users = (await db.execute(
                select(User.id).where(User.client_id == room_obj.client_id, User.is_active == True)
            )).scalars().all()
            for uid in list(assigned) + list(client_users):
                if uid != user.id and manager.is_user_online(uid):
                    is_recipient_online = True
                    break

    is_admin = user.role in ("admin", "super_admin")
    items = []
    for msg in reversed(messages):
        sender_info = MessageSender(
            id=msg.sender.id if msg.sender else msg.sender_id,
            name=msg.sender.name if msg.sender else "Deleted User",
            role=msg.sender.role if msg.sender else "user",
        )
        is_own = msg.sender_id == user.id
        if is_own:
            if max_read_at and msg.created_at and msg.created_at <= max_read_at:
                msg_status = "read"
            elif is_recipient_online:
                msg_status = "delivered"
            else:
                msg_status = "sent"
        else:
            msg_status = "read"

        is_deleted = getattr(msg, "is_deleted", False)
        if is_deleted:
            if is_admin:
                # Admin Audit View: retains original message and attachments with audit metadata
                m_text = msg.message
                att_type = msg.attachment_type
                att_ref = msg.attachment_reference
                del_by = msg.deleted_by
                del_name = msg.deleted_by_user.name if msg.deleted_by_user else "Admin"
                del_role = msg.deleted_by_user.role if msg.deleted_by_user else "admin"
                del_at = msg.deleted_at
            else:
                # Non-admin users: sanitized deleted placeholder and stripped attachments
                m_text = "This message was deleted."
                att_type = None
                att_ref = None
                del_by = None
                del_name = None
                del_role = None
                del_at = msg.deleted_at
        else:
            m_text = msg.message
            att_type = msg.attachment_type
            att_ref = msg.attachment_reference
            del_by = None
            del_name = None
            del_role = None
            del_at = None

        items.append(
            ChatMessageResponse(
                id=msg.id,
                room_id=msg.room_id,
                sender=sender_info,
                message=m_text,
                attachment_type=att_type,
                attachment_reference=att_ref,
                status=msg_status,
                created_at=msg.created_at,
                edited_at=msg.edited_at,
                is_deleted=is_deleted,
                deleted_by=del_by,
                deleted_by_name=del_name,
                deleted_by_role=del_role,
                deleted_at=del_at,
            )
        )

    total = res_count.scalar() or 0
    return ChatMessagesListResponse(items=items, has_more=has_more, total=total)


async def send_message(
    db: AsyncSession,
    room_id: uuid.UUID,
    user: User,
    text: str,
    attachment_type: str | None = None,
    attachment_reference: str | None = None,
    attachment_filename: str | None = None,
    client_id: str | None = None,
) -> ChatMessageResponse:
    room = await check_room_access(db, user, room_id)

    if room.status in ("locked", "read_only") and user.role not in ("admin", "sub_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This chat room has been locked by an administrator. Messages cannot be sent.",
        )

    if room.status == "archived":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This chat room is archived. Messages cannot be sent.",
        )

    msg = ChatMessage(
        id=uuid.uuid4(),
        room_id=room_id,
        sender_id=user.id,
        message=text,
        attachment_type=attachment_type,
        attachment_reference=attachment_reference,
    )
    db.add(msg)
    await db.flush()

    # Automatically mark read for the sender
    read_record = (
        await db.execute(
            select(ChatRead).where(ChatRead.user_id == user.id, ChatRead.room_id == room_id)
        )
    ).scalar_one_or_none()

    if not read_record:
        read_record = ChatRead(
            id=uuid.uuid4(),
            user_id=user.id,
            room_id=room_id,
            last_read_message_id=msg.id,
            last_read_at=datetime.now(timezone.utc),
        )
        db.add(read_record)
    else:
        read_record.last_read_message_id = msg.id
        read_record.last_read_at = datetime.now(timezone.utc)

    await db.flush()
    invalidate_chat_cache()

    from app.modules.chat.websocket import manager
    room_id_str = str(room_id)
    online_users = manager.get_online_users(room_id_str)
    has_recipients = any(uid != str(user.id) for uid in online_users) or any(
        manager.is_user_online(uid) for uid in manager.user_connections if uid != str(user.id)
    )
    initial_status = "delivered" if has_recipients else "sent"

    sender_info = MessageSender(id=user.id, name=user.name, role=user.role)
    return ChatMessageResponse(
        id=msg.id,
        room_id=msg.room_id,
        sender=sender_info,
        message=msg.message,
        attachment_type=msg.attachment_type,
        attachment_reference=msg.attachment_reference,
        client_id=client_id,
        status=initial_status,
        created_at=msg.created_at or datetime.now(timezone.utc),
        edited_at=None,
    )


async def share_resume(
    db: AsyncSession, room_id: uuid.UUID, user: User, resume_id: uuid.UUID, caption: str | None = None
) -> ChatMessageResponse:
    room = await check_room_access(db, user, room_id)

    resume = (
        await db.execute(
            select(Resume).where(Resume.id == resume_id, Resume.client_id == room.client_id)
        )
    ).scalar_one_or_none()

    if not resume:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume not found or does not belong to this service client.",
        )

    default_text = f"📄 Shared Candidate: {resume.candidate_name} ({resume.company} – {resume.role})"
    text = caption.strip() if caption and caption.strip() else default_text
    return await send_message(
        db,
        room_id,
        user,
        text,
        attachment_type="resume",
        attachment_reference=str(resume.id),
        attachment_filename=resume.original_filename,
    )


async def share_job(
    db: AsyncSession, room_id: uuid.UUID, user: User, requirement_id: uuid.UUID, caption: str | None = None
) -> ChatMessageResponse:
    from app.modules.requirements.models import Requirement
    await check_room_access(db, user, room_id)

    req = (
        await db.execute(
            select(Requirement).where(Requirement.id == requirement_id)
        )
    ).scalar_one_or_none()

    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job requirement not found.",
        )

    title = req.job_title or req.role or "Open Role"
    company = req.company or "Company"
    text = caption.strip() if caption and caption.strip() else f"💼 Shared Job Opening: {title} ({company})"
    return await send_message(
        db,
        room_id,
        user,
        text,
        attachment_type="job",
        attachment_reference=str(req.id),
        attachment_filename=title,
    )


async def mark_read(
    db: AsyncSession, room_id: uuid.UUID, user: User, message_id: uuid.UUID | None = None
) -> None:
    now = datetime.now(timezone.utc)
    if not message_id:
        last_msg = (
            await db.execute(
                select(ChatMessage.id)
                .where(ChatMessage.room_id == room_id)
                .order_by(ChatMessage.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        message_id = last_msg

    read_record = (
        await db.execute(
            select(ChatRead).where(ChatRead.user_id == user.id, ChatRead.room_id == room_id)
        )
    ).scalar_one_or_none()

    if not read_record:
        read_record = ChatRead(
            id=uuid.uuid4(),
            user_id=user.id,
            room_id=room_id,
            last_read_message_id=message_id,
            last_read_at=now,
        )
        db.add(read_record)
    else:
        read_record.last_read_message_id = message_id
        read_record.last_read_at = now

    await db.flush()
    invalidate_chat_cache()


async def get_total_unread(db: AsyncSession, user: User) -> UnreadCountResponse:
    cache_key = f"chat_unread:{user.id!s}"
    cached = cache.get(cache_key)
    if cached is not None:
        return UnreadCountResponse(total_unread=cached, unread_count=cached)

    allowed = await get_allowed_client_ids(db, user)
    client_q = select(ChatRoom.id).join(Client, ChatRoom.client_id == Client.id).where(Client.is_active == True)
    if allowed is not None:
        if not allowed:
            return UnreadCountResponse(total_unread=0, unread_count=0)
        client_q = client_q.where(Client.id.in_(allowed))

    room_ids = (await db.execute(client_q)).scalars().all()
    if not room_ids:
        return UnreadCountResponse(total_unread=0, unread_count=0)

    reads_res = await db.execute(
        select(ChatRead).where(ChatRead.user_id == user.id, ChatRead.room_id.in_(room_ids))
    )
    read_map = {r.room_id: r.last_read_at for r in reads_res.scalars().all()}

    total_unread = 0
    for r_id in room_ids:
        last_read_dt = read_map.get(r_id)
        q = select(func.count(ChatMessage.id)).where(
            ChatMessage.room_id == r_id,
            ChatMessage.sender_id != user.id,
        )
        if last_read_dt:
            q = q.where(ChatMessage.created_at > last_read_dt)
        cnt = (await db.execute(q)).scalar() or 0
        total_unread += cnt

    cache.set(cache_key, total_unread, ttl=30.0, tags={"chat"})
    return UnreadCountResponse(total_unread=total_unread, unread_count=total_unread)


async def delete_message(
    db: AsyncSession, message_id: uuid.UUID, user: User
) -> dict:
    stmt = (
        select(ChatMessage)
        .options(selectinload(ChatMessage.sender))
        .where(ChatMessage.id == message_id)
    )
    msg = (await db.execute(stmt)).scalar_one_or_none()

    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    sender_role = msg.sender.role if msg.sender else "user"
    is_own = (msg.sender_id == user.id)
    allowed = False
    if user.role in ("admin", "super_admin"):
        allowed = True
    elif user.role == "sub_admin":
        if sender_role in ("admin", "super_admin"):
            allowed = is_own
        else:
            allowed = True
    else:
        allowed = is_own

    if not allowed:
        raise HTTPException(status_code=403, detail="Forbidden: You do not have permission to delete this message")

    now = datetime.now(timezone.utc)
    room_id = str(msg.room_id)
    msg.is_deleted = True
    msg.deleted_by = user.id
    msg.deleted_at = now
    await db.flush()
    invalidate_chat_cache()
    return {
        "success": True,
        "room_id": room_id,
        "message_id": str(message_id),
        "deleted_by": str(user.id),
        "deleted_by_name": user.name,
        "deleted_by_role": user.role,
        "deleted_at": now.isoformat(),
    }


async def lock_room(db: AsyncSession, room_id: uuid.UUID, user: User) -> dict:
    if user.role not in ("admin", "sub_admin"):
        raise HTTPException(status_code=403, detail="Only Admins can lock rooms")
    room = await check_room_access(db, user, room_id)
    room.status = "read_only"
    await db.flush()
    invalidate_chat_cache()
    return {"success": True, "status": "read_only"}


async def unlock_room(db: AsyncSession, room_id: uuid.UUID, user: User) -> dict:
    if user.role not in ("admin", "sub_admin"):
        raise HTTPException(status_code=403, detail="Only Admins can unlock rooms")
    room = await check_room_access(db, user, room_id)
    room.status = "active"
    await db.flush()
    invalidate_chat_cache()
    return {"success": True, "status": "active"}


async def archive_room(db: AsyncSession, room_id: uuid.UUID, user: User) -> dict:
    if user.role not in ("admin", "sub_admin"):
        raise HTTPException(status_code=403, detail="Only Admins can archive rooms")
    room = await check_room_access(db, user, room_id)
    room.status = "archived"
    await db.flush()
    invalidate_chat_cache()
    return {"success": True, "status": "archived"}


async def export_room_chat(db: AsyncSession, room_id: uuid.UUID, user: User) -> dict:
    room = await check_room_access(db, user, room_id)
    messages = (
        await db.execute(
            select(ChatMessage)
            .where(ChatMessage.room_id == room_id)
            .options(selectinload(ChatMessage.sender))
            .order_by(ChatMessage.created_at.asc())
        )
    ).scalars().all()

    transcript = []
    for m in messages:
        sender_name = m.sender.name if m.sender else "Unknown"
        transcript.append(
            f"[{m.created_at.strftime('%Y-%m-%d %H:%M:%S')}] {sender_name}: {m.message}"
        )

    return {
        "room_id": str(room_id),
        "client_name": room.client.company_name if room.client else "Client",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "transcript": "\n".join(transcript),
    }

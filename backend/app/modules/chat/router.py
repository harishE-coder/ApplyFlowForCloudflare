"""
Chat REST API router.
"""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.core.rate_limit import rate_limit
from app.core.security import create_access_token
from app.modules.chat import service
from app.modules.chat.models import PushSubscription
from app.modules.chat.push_service import (
    get_admin_push_telemetry,
    notify_room_recipients,
)
from app.modules.chat.schemas import (
    ChatMessageResponse,
    ChatMessagesListResponse,
    ChatRoomsListResponse,
    MarkReadRequest,
    NotificationPreferencesResponse,
    NotificationPreferencesUpdate,
    PushSubscriptionCreate,
    PushUnsubscribeRequest,
    SendMessageRequest,
    ShareJobRequest,
    ShareResumeRequest,
    UnreadCountResponse,
    VapidPublicKeyResponse,
)
from app.modules.chat.websocket import manager
from app.modules.notifications.models import NotificationPreference

router = APIRouter(prefix="/api/chat", tags=["Chat"])


@router.get("/ws-token")
async def get_ws_token(current_user=Depends(get_current_user)):
    """Generate a token for WebSocket connection authentication."""
    token = create_access_token(current_user.id, current_user.role)
    return {"token": token, "user_id": str(current_user.id), "user_name": current_user.name}


# ---- Push & Preference Endpoints ----

@router.get("/push/vapid-public-key", response_model=VapidPublicKeyResponse)
async def get_vapid_public_key():
    """Get the public VAPID key for browser PushManager subscription."""
    return VapidPublicKeyResponse(public_key=settings.vapid_public_key)


@router.get("/push/status", dependencies=[Depends(require_role("admin", "sub_admin"))])
@router.get("/admin/status", dependencies=[Depends(require_role("admin", "sub_admin"))])
async def get_push_monitoring_status(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Admin monitoring endpoint for Web Push statistics and active chat connections."""
    return await get_admin_push_telemetry(db)


@router.post("/push/subscribe", dependencies=[Depends(rate_limit(10, 60))])
async def subscribe_push(
    body: PushSubscriptionCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Save or update a Web Push subscription for the authenticated user (Rate limited: 10/min)."""
    sub = (
        await db.execute(
            select(PushSubscription).where(PushSubscription.endpoint == body.endpoint)
        )
    ).scalar_one_or_none()

    if sub:
        # Upsert existing endpoint
        sub.user_id = current_user.id
        sub.p256dh = body.keys.p256dh
        sub.auth = body.keys.auth
        sub.created_at = datetime.now(timezone.utc)
    else:
        sub = PushSubscription(
            user_id=current_user.id,
            endpoint=body.endpoint,
            p256dh=body.keys.p256dh,
            auth=body.keys.auth,
        )
        db.add(sub)

    await db.commit()
    return {"success": True, "endpoint": sub.endpoint}


@router.delete("/push/unsubscribe", dependencies=[Depends(rate_limit(20, 60))])
@router.post("/push/unsubscribe", dependencies=[Depends(rate_limit(20, 60))])
async def unsubscribe_push(
    body: PushUnsubscribeRequest | None = None,
    endpoint: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Unsubscribe a browser endpoint from Web Push notifications (Rate limited: 20/min)."""
    target_endpoint = (body.endpoint if body else None) or endpoint
    query = select(PushSubscription).where(PushSubscription.user_id == current_user.id)
    if target_endpoint:
        query = query.where(PushSubscription.endpoint == target_endpoint)

    subs = (await db.execute(query)).scalars().all()
    for s in subs:
        await db.delete(s)

    await db.commit()
    return {"success": True, "removed_count": len(subs)}


@router.get("/preferences", response_model=NotificationPreferencesResponse, dependencies=[Depends(rate_limit(30, 60))])
async def get_preferences(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get chat notification preferences for current user (Rate limited: 30/min)."""
    pref = (
        await db.execute(
            select(NotificationPreference).where(NotificationPreference.user_id == current_user.id)
        )
    ).scalar_one_or_none()

    if not pref:
        return NotificationPreferencesResponse(
            chat_push=True,
            email_notifications=True,
            sound=True,
            muted_rooms=[],
        )

    return NotificationPreferencesResponse(
        chat_push=pref.chat_push,
        email_notifications=pref.email_notifications,
        sound=pref.sound,
        muted_rooms=pref.muted_rooms or [],
    )


@router.patch("/preferences", response_model=NotificationPreferencesResponse, dependencies=[Depends(rate_limit(30, 60))])
async def update_preferences(
    body: NotificationPreferencesUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Update chat notification preferences for current user (Rate limited: 30/min)."""

    pref = (
        await db.execute(
            select(NotificationPreference).where(NotificationPreference.user_id == current_user.id)
        )
    ).scalar_one_or_none()

    if not pref:
        pref = NotificationPreference(
            user_id=current_user.id,
            chat_push=body.chat_push if body.chat_push is not None else True,
            email_notifications=body.email_notifications if body.email_notifications is not None else True,
            sound=body.sound if body.sound is not None else True,
            muted_rooms=body.muted_rooms if body.muted_rooms is not None else [],
        )
        db.add(pref)
    else:
        if body.chat_push is not None:
            pref.chat_push = body.chat_push
        if body.email_notifications is not None:
            pref.email_notifications = body.email_notifications
        if body.sound is not None:
            pref.sound = body.sound
        if body.muted_rooms is not None:
            pref.muted_rooms = body.muted_rooms

    await db.commit()
    await db.refresh(pref)

    return NotificationPreferencesResponse(
        chat_push=pref.chat_push,
        email_notifications=pref.email_notifications,
        sound=pref.sound,
        muted_rooms=pref.muted_rooms or [],
    )


# ---- Room & Message Endpoints ----

@router.get("/rooms", response_model=ChatRoomsListResponse)
async def list_rooms(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """List all chat rooms accessible by the current user."""
    return await service.get_rooms_for_user(db, current_user)


@router.get("/rooms/{room_id}/messages", response_model=ChatMessagesListResponse)
async def get_room_messages(
    room_id: UUID,
    limit: int = Query(50, ge=1, le=100),
    before_id: UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get paginated messages for a chat room."""
    return await service.get_messages(db, room_id, current_user, limit, before_id)


@router.post("/rooms/{room_id}/messages", response_model=ChatMessageResponse)
async def send_message(
    room_id: UUID,
    body: SendMessageRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Send a text message to a chat room."""
    res = await service.send_message(
        db, room_id, current_user,
        body.message,
        attachment_type=body.attachment_type,
        attachment_reference=body.attachment_reference,
        attachment_filename=body.attachment_filename,
        client_id=body.client_id,
    )
    room_id_str = str(room_id)
    online_users = manager.get_online_users(room_id_str)
    has_recipients = any(uid != str(current_user.id) for uid in online_users) or any(
        manager.is_user_online(uid) for uid in manager.user_connections if uid != str(current_user.id)
    )
    if has_recipients:
        res.status = "delivered"

    msg_data = res.model_dump(mode="json")

    # Broadcast to active WebSocket connections in room
    await manager.broadcast(room_id_str, {
        "type": "new_message",
        "message": msg_data,
    })

    # Broadcast live room update to other active user sockets across the app
    for uid in list(manager.user_connections.keys()):
        if uid != str(current_user.id):
            await manager.send_to_user_global(uid, {
                "type": "room_update",
                "room_id": room_id_str,
                "message": msg_data,
                "last_message": res.message,
                "last_message_sender": current_user.name,
                "last_message_at": res.created_at.isoformat() if res.created_at else datetime.now(timezone.utc).isoformat(),
            })

    # Dispatch Web Push notifications via FastAPI BackgroundTasks
    background_tasks.add_task(
        notify_room_recipients,
        room_id=room_id,
        sender_id=current_user.id,
        sender_name=current_user.name,
        message_id=res.id,
        preview_text=res.message,
        attachment_type=res.attachment_type,
        created_at=res.created_at,
    )

    return res


@router.post("/rooms/{room_id}/share-resume", response_model=ChatMessageResponse)
async def share_resume(
    room_id: UUID,
    body: ShareResumeRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Share a resume into a chat room."""
    res = await service.share_resume(db, room_id, current_user, body.resume_id, caption=body.caption)
    room_id_str = str(room_id)
    online_users = manager.get_online_users(room_id_str)
    has_recipients = any(uid != str(current_user.id) for uid in online_users) or any(
        manager.is_user_online(uid) for uid in manager.user_connections if uid != str(current_user.id)
    )
    if has_recipients:
        res.status = "delivered"

    msg_data = res.model_dump(mode="json")

    # Broadcast to active WebSocket connections in room
    await manager.broadcast(room_id_str, {
        "type": "new_message",
        "message": msg_data,
    })

    # Broadcast live room update to other active user sockets across the app
    for uid in list(manager.user_connections.keys()):
        if uid != str(current_user.id):
            await manager.send_to_user_global(uid, {
                "type": "room_update",
                "room_id": room_id_str,
                "message": msg_data,
                "last_message": res.message,
                "last_message_sender": current_user.name,
                "last_message_at": res.created_at.isoformat() if res.created_at else datetime.now(timezone.utc).isoformat(),
            })

    # Dispatch Web Push notifications via FastAPI BackgroundTasks
    background_tasks.add_task(
        notify_room_recipients,
        room_id=room_id,
        sender_id=current_user.id,
        sender_name=current_user.name,
        message_id=res.id,
        preview_text=res.message,
        attachment_type=res.attachment_type,
        created_at=res.created_at,
    )

    return res


@router.post("/rooms/{room_id}/share-job", response_model=ChatMessageResponse)
async def share_job(
    room_id: UUID,
    body: ShareJobRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Share a job opening into a chat room."""
    res = await service.share_job(db, room_id, current_user, body.requirement_id, body.caption)
    room_id_str = str(room_id)
    online_users = manager.get_online_users(room_id_str)
    has_recipients = any(uid != str(current_user.id) for uid in online_users) or any(
        manager.is_user_online(uid) for uid in manager.user_connections if uid != str(current_user.id)
    )
    if has_recipients:
        res.status = "delivered"

    msg_data = res.model_dump(mode="json")

    # Broadcast to active WebSocket connections in room
    await manager.broadcast(room_id_str, {
        "type": "new_message",
        "message": msg_data,
    })

    # Broadcast live room update to other active user sockets across the app
    for uid in list(manager.user_connections.keys()):
        if uid != str(current_user.id):
            await manager.send_to_user_global(uid, {
                "type": "room_update",
                "room_id": room_id_str,
                "message": msg_data,
                "last_message": res.message,
                "last_message_sender": current_user.name,
                "last_message_at": res.created_at.isoformat() if res.created_at else datetime.now(timezone.utc).isoformat(),
            })

    # Dispatch Web Push notifications via FastAPI BackgroundTasks
    background_tasks.add_task(
        notify_room_recipients,
        room_id=room_id,
        sender_id=current_user.id,
        sender_name=current_user.name,
        message_id=res.id,
        preview_text=res.message,
        attachment_type=res.attachment_type,
        created_at=res.created_at,
    )

    return res



@router.patch("/rooms/{room_id}/read")
@router.post("/rooms/{room_id}/read")
async def mark_read(
    room_id: UUID,
    body: MarkReadRequest | None = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Mark messages as read up to a specific message or all."""
    await service.check_room_access(db, current_user, room_id)
    msg_id = body.message_id if body else None
    await service.mark_read(db, room_id, current_user, msg_id)
    room_id_str = str(room_id)

    # Broadcast read receipt to other participants in the room
    await manager.broadcast(room_id_str, {
        "type": "read_receipt",
        "user_id": str(current_user.id),
        "user_name": current_user.name,
        "message_id": str(msg_id) if msg_id else None,
    }, exclude_user=str(current_user.id))

    if msg_id:
        # Check if the marked message was sent by someone else before broadcasting status: read
        target_msg = (
            await db.execute(select(ChatMessage).where(ChatMessage.id == msg_id))
        ).scalar_one_or_none()
        if target_msg and target_msg.sender_id != current_user.id:
            await manager.broadcast(room_id_str, {
                "type": "message_status",
                "message_id": str(msg_id),
                "status": "read",
                "read_by": str(current_user.id),
            })
    else:
        await manager.broadcast(room_id_str, {
            "type": "message_status",
            "status": "read",
            "room_id": room_id_str,
            "read_by": str(current_user.id),
        }, exclude_user=str(current_user.id))

    return {"success": True}


@router.post("/rooms/{room_id}/lock")
async def lock_room(
    room_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Lock room into read-only mode."""
    return await service.lock_room(db, room_id, current_user)


@router.post("/rooms/{room_id}/unlock")
async def unlock_room(
    room_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Unlock room into active mode."""
    return await service.unlock_room(db, room_id, current_user)


@router.post("/rooms/{room_id}/archive")
async def archive_room(
    room_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Archive chat room."""
    return await service.archive_room(db, room_id, current_user)


@router.get("/rooms/{room_id}/export")
async def export_room_chat(
    room_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Export room chat transcript."""
    return await service.export_room_chat(db, room_id, current_user)


@router.delete("/messages/{message_id}")
async def delete_message(
    message_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Delete a chat message."""
    res = await service.delete_message(db, message_id, current_user)
    if "room_id" in res:
        await manager.broadcast(res["room_id"], {
            "type": "message_deleted",
            "message_id": str(message_id),
            "room_id": res["room_id"],
            "deleted_by": res.get("deleted_by"),
            "deleted_by_name": res.get("deleted_by_name"),
            "deleted_by_role": res.get("deleted_by_role"),
            "deleted_at": res.get("deleted_at"),
        })
    return res


@router.get("/unread-count", response_model=UnreadCountResponse)
async def unread_count(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get total unread message count across all accessible rooms."""
    return await service.get_total_unread(db, current_user)

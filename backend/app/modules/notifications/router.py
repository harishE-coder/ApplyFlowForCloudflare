import uuid

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.modules.notifications import service
from app.modules.notifications.schemas import NotificationListResponse
from app.modules.users.models import User
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get in-app notifications and unread count for the current user."""
    return await service.get_user_notifications(db, current_user)


@router.put("/{notification_id}/read")
@router.post("/{notification_id}/read")
async def mark_notification_read(
    notification_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a specific notification as read."""
    await service.mark_as_read(db, current_user, notification_id)
    return {"message": "Marked as read"}


@router.post("/read-all")
async def mark_all_notifications_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark all unread notifications as read."""
    count = await service.mark_all_as_read(db, current_user)
    return {"message": f"{count} notifications marked as read"}


@router.delete("/clear-read")
async def clear_read_notifications_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Clear all read notifications for current user."""
    count = await service.clear_read_notifications(db, current_user)
    return {"message": f"{count} read notifications cleared"}


@router.delete("/clear-old")
async def clear_old_notifications_endpoint(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Clear read notifications older than specified days."""
    count = await service.clear_old_notifications(db, current_user, days=days)
    return {"message": f"{count} old notifications cleared"}


@router.delete("/{notification_id}")
async def delete_notification_endpoint(
    notification_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a single notification."""
    await service.delete_notification(db, current_user, notification_id)
    return {"message": "Notification deleted successfully"}


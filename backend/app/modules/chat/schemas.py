"""
Chat Pydantic schemas for request/response validation.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel

# ---- Response Schemas ----

class ChatParticipant(BaseModel):
    id: uuid.UUID
    name: str
    role: str


class ChatRoomResponse(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    client_name: str
    participants: list[ChatParticipant] = []
    last_message: str | None = None
    last_message_sender: str | None = None
    last_message_at: datetime | None = None
    unread_count: int = 0

    model_config = {"from_attributes": True}


class MessageSender(BaseModel):
    id: uuid.UUID | None = None
    name: str = "Deleted User"
    role: str = "user"


class ChatMessageResponse(BaseModel):
    id: uuid.UUID
    room_id: uuid.UUID
    sender: MessageSender
    message: str
    attachment_type: str | None = None  # "resume", "pdf", "image", etc.
    attachment_reference: str | None = None  # Resume ID, drive file ID, or download URL
    attachment_name: str | None = None
    attachment_filename: str | None = None
    attachment_url: str | None = None
    attachment_download_url: str | None = None
    attachment_thumbnail_url: str | None = None
    resume_data: dict | None = None
    job_data: dict | None = None
    client_id: str | None = None
    status: str = "sent"  # "pending", "sent", "delivered", "read"
    created_at: datetime
    edited_at: datetime | None = None
    is_deleted: bool = False
    deleted_by: uuid.UUID | None = None
    deleted_by_name: str | None = None
    deleted_by_role: str | None = None
    deleted_at: datetime | None = None

    model_config = {"from_attributes": True}


class ChatMessagesListResponse(BaseModel):
    items: list[ChatMessageResponse]
    total: int
    has_more: bool = False


class ChatRoomsListResponse(BaseModel):
    items: list[ChatRoomResponse]
    total_unread: int = 0


class UnreadCountResponse(BaseModel):
    total_unread: int = 0
    unread_count: int = 0


class ShareableResumeItem(BaseModel):
    id: uuid.UUID
    candidate_name: str | None = None
    company: str | None = None
    role_designation: str | None = None
    original_filename: str | None = None
    drive_file_id: str | None = None
    status: str | None = None


# ---- Request Schemas ----

class SendMessageRequest(BaseModel):
    message: str
    client_id: str | None = None
    attachment_type: str | None = None
    attachment_reference: str | None = None
    attachment_filename: str | None = None


class ShareResumeRequest(BaseModel):
    resume_id: uuid.UUID


class MarkReadRequest(BaseModel):
    message_id: uuid.UUID | None = None


# ---- Push & Preference Schemas ----

class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionCreate(BaseModel):
    endpoint: str
    keys: PushKeys


class PushUnsubscribeRequest(BaseModel):
    endpoint: str


class VapidPublicKeyResponse(BaseModel):
    public_key: str | None = None


class NotificationPreferencesResponse(BaseModel):
    chat_push: bool = True
    email_notifications: bool = True
    sound: bool = True
    muted_rooms: list[str] = []

    model_config = {"from_attributes": True}


class NotificationPreferencesUpdate(BaseModel):
    chat_push: bool | None = None
    email_notifications: bool | None = None
    sound: bool | None = None
    muted_rooms: list[str] | None = None


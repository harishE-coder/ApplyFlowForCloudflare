from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.modules.applications.models import Application


class EmailTrainingData(Base):
    __tablename__ = "email_training_data"
    __table_args__ = (
        Index("ix_email_train_company_cat", "company", "category"),
        Index("ix_email_train_created_cat", "created_at", "category"),
        Index("ix_email_train_domain_cat", "sender_domain", "category"),
        Index("ix_email_train_company_created", "company", "created_at"),
        Index("ix_email_train_status_created", "processing_status", "created_at"),
        Index("ix_email_train_retraining", "needs_retraining", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    # Optimistic locking version
    version: Mapped[int] = mapped_column(
        Integer, default=1, nullable=False
    )
    thread_id: Mapped[uuid.UUID | None] = mapped_column(
        nullable=True, index=True
    )  # Persistent conversation chain thread UUID
    message_id: Mapped[str | None] = mapped_column(
        String(500), nullable=True, index=True
    )  # RFC 822 Message-ID header
    in_reply_to: Mapped[str | None] = mapped_column(
        String(500), nullable=True, index=True
    )  # Threading parent Message-ID
    email_hash: Mapped[str] = mapped_column(
        String(64), nullable=False, index=True
    )
    subject: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    sender_email: Mapped[str | None] = mapped_column(
        String(320), nullable=True, index=True
    )
    sender_domain: Mapped[str | None] = mapped_column(
        String(255), nullable=True, index=True
    )
    sender_name: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    body_preview: Mapped[str | None] = mapped_column(
        String(300), nullable=True
    )
    storage_key: Mapped[str] = mapped_column(
        String(500), nullable=False, index=True
    )  # Supabase path: emails/normalized/YYYY/MM/DD/{hash}.json
    raw_storage_key: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )  # Supabase path: emails/raw/YYYY/MM/DD/{hash}.eml
    body_sha256: Mapped[str] = mapped_column(
        String(64), nullable=False
    )
    attachment_metadata: Mapped[list[dict] | None] = mapped_column(
        JSON, nullable=True
    )  # [{"name": "Invite.ics", "size": 3200, "content_type": "text/calendar"}]
    company: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    role: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    category: Mapped[str | None] = mapped_column(
        String(100), nullable=True, index=True
    )  # Standard label taxonomy
    confidence: Mapped[int] = mapped_column(
        Integer, default=0
    )
    source: Mapped[str] = mapped_column(
        String(50), nullable=False, default="api_key"
    )  # "api_key", "human", or legacy historical source
    classification_source_version: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )  # e.g. "api_key_teacher_v1", "human_admin"
    pipeline_version: Mapped[str] = mapped_column(
        String(50), default="interview_pipeline_v2.0", nullable=False
    )  # e.g. "interview_pipeline_v2.0"
    needs_retraining: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, index=True
    )  # Legacy field retained for older rows; new API-key intake does not self-train
    ai_reasoning: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # Structured JSON explanation from Groq or model feature signals
    processing_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="pending", index=True
    )  # "pending", "parsed", "classified", "failed"
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), index=True
    )

    # Relationships
    interview_events: Mapped[list[InterviewEvent]] = relationship(
        back_populates="training_email", lazy="selectin"
    )
    review_actions: Mapped[list[ReviewAction]] = relationship(
        back_populates="training_email", cascade="all, delete-orphan", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<EmailTrainingData id={self.id} hash={self.email_hash[:8]} cat={self.category} v={self.version} retrain={self.needs_retraining}>"


class InterviewEvent(Base):
    __tablename__ = "interview_events"
    __table_args__ = (
        Index("ix_interview_events_status_sched", "status", "scheduled_at"),
        Index("ix_interview_events_thread_seq", "thread_id", "event_sequence"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    thread_id: Mapped[uuid.UUID | None] = mapped_column(
        nullable=True, index=True
    )  # Persistent conversation chain thread UUID
    application_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), nullable=True, index=True
    )
    email_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("email_training_data.id", ondelete="CASCADE"), nullable=True, index=True
    )
    event_type: Mapped[str] = mapped_column(
        String(100), nullable=False
    )  # e.g., "interview", "technical_assessment", "hr_screening", "interview_reschedule", "offer", "rejection"
    event_sequence: Mapped[int] = mapped_column(
        Integer, default=1, nullable=False
    )  # Chronological order within application journey (1, 2, 3, 4, 5...)
    round_name: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )  # Dynamically extracted company round (e.g. "Bar Raiser", "Hiring Committee", "Team Match", "Phone Screen")
    round_type: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )  # Category type: "interview", "technical_assessment", "internal", "hr_screening", "offer", "rejection"
    round: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )  # Legacy alias/fallback for round_name
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="Scheduled"
    )  # "Scheduled", "Completed", "Rescheduled", "Cancelled", "Pending"
    scheduled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    meeting_link: Mapped[str | None] = mapped_column(
        String(1000), nullable=True
    )
    deadline: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )  # Take-home deadline or assessment expiry
    recruiter: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    raw_json: Mapped[dict | None] = mapped_column(
        JSON, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    # Relationships
    application: Mapped[Application | None] = relationship(
        foreign_keys=[application_id], lazy="selectin"
    )
    training_email: Mapped[EmailTrainingData | None] = relationship(
        back_populates="interview_events", foreign_keys=[email_id], lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<InterviewEvent id={self.id} type={self.event_type} round={self.round} seq={self.event_sequence} status={self.status}>"


class ReviewAction(Base):
    """
    Audit log trail recording human reviewer corrections and verification actions.
    Corrections are stored for accountability, not local self-learning.
    """
    __tablename__ = "review_actions"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    email_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("email_training_data.id", ondelete="CASCADE"), nullable=False, index=True
    )
    reviewer: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    reviewer_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    old_label: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    new_label: Mapped[str] = mapped_column(
        String(100), nullable=False
    )
    notes: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    # Relationships
    training_email: Mapped[EmailTrainingData] = relationship(
        back_populates="review_actions", foreign_keys=[email_id], lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<ReviewAction id={self.id} old={self.old_label} new={self.new_label} by={self.reviewer}>"

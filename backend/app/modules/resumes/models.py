from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Date,
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
    from app.modules.clients.models import Client
    from app.modules.requirements.models import Requirement
    from app.modules.users.models import User


class Resume(Base):
    __tablename__ = "resumes"
    __table_args__ = (
        Index("ix_resumes_client_date", "client_id", "resume_date"),
        Index("ix_resumes_uploader_date", "uploaded_by", "resume_date"),
        Index("ix_resumes_client_comp", "client_id", "company"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    display_seq: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        unique=False,
    )

    candidate_name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    company: Mapped[str] = mapped_column(String(100), nullable=False, index=True)  # Target company e.g. TCS
    role: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    resume_id_tag: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )  # Parsed from filename (e.g., "RES1023")

    requirement_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("requirements.id", ondelete="SET NULL"), nullable=True, index=True
    )
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("clients.id", ondelete="SET NULL"), nullable=True, index=True
    )
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Cloudflare R2 Storage references
    r2_key: Mapped[str | None] = mapped_column(String(500), nullable=True, index=True)
    file_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)  # SHA-256 binary hash
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(100), default="application/pdf", nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    # Legacy Google Drive references (backward compatibility)
    drive_file_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    drive_folder_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)

    resume_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    work_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    client_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_note_shared: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", nullable=False)

    upload_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    requirement: Mapped[Requirement | None] = relationship(back_populates="resumes", lazy="selectin")
    client: Mapped[Client | None] = relationship(lazy="selectin")
    uploader: Mapped[User | None] = relationship(lazy="selectin")

    @property
    def display_id(self) -> str:
        """User-facing resume ID: RES1001, RES1002, or parsed tag."""
        if self.resume_id_tag:
            return self.resume_id_tag
        if self.display_seq is not None:
            return f"RES{1000 + self.display_seq}"
        return f"RES{abs(hash(str(self.id))) % 9000 + 1000}"

    def __repr__(self) -> str:
        return f"<Resume {self.display_id} - {self.candidate_name} ({self.company})>"

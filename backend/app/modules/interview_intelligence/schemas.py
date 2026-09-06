"""
Pydantic schemas for the Interview Intelligence Pipeline (v1.0 Production-Ready):
- Standardized 13-class label taxonomy (EmailCategory)
- Normalized round types (RoundType) and status definitions (EventStatus)
- First-class conversation thread_id tracking
- Deterministic Groq AI Teacher structured extraction
- API-key classifier telemetry, review action audit trails, and timeline responses
"""

import uuid
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class EmailCategory(str, Enum):
    """Standardized 13-class label taxonomy for ApplyFlow email classification."""
    INTERVIEW = "interview"
    HR_SCREENING = "hr_screening"
    TECHNICAL_ASSESSMENT = "technical_assessment"
    TAKE_HOME = "take_home"
    INTERVIEW_CONFIRMATION = "interview_confirmation"
    INTERVIEW_RESCHEDULE = "interview_reschedule"
    INTERVIEW_CANCELLED = "interview_cancelled"
    RECRUITER_FOLLOWUP = "recruiter_followup"
    APPLICATION_UPDATE = "application_update"
    RESPONSE_REQUEST = "response_request"
    REJECTION = "rejection"
    NON_IT = "non_it"
    OTHER = "other"


class RoundType(str, Enum):
    """Standardized round types for interview event classification."""
    INTERVIEW = "interview"
    TECHNICAL_ASSESSMENT = "technical_assessment"
    HR_SCREENING = "hr_screening"
    INTERNAL = "internal"
    OFFER = "offer"
    REJECTION = "rejection"
    OTHER = "other"


class EventStatus(str, Enum):
    """Standardized event status for candidate timeline progression."""
    SCHEDULED = "Scheduled"
    CONFIRMED = "Confirmed"
    RESCHEDULED = "Rescheduled"
    CANCELLED = "Cancelled"
    COMPLETED = "Completed"
    PENDING = "Pending"
    REJECTED = "Rejected"


class AttachmentMeta(BaseModel):
    """Metadata describing email attachments (e.g. invite.ics, guide.pdf)."""
    name: str
    size: int = 0
    content_type: str | None = None


class NormalizedEmail(BaseModel):
    """Normalized email object output from Stage 1 Email Parser."""
    message_id: str | None = None
    in_reply_to: str | None = None
    references: list[str] = Field(default_factory=list)
    subject: str = ""
    sender_email: str = ""
    sender_name: str = ""
    sender_domain: str = ""
    body: str = ""
    body_preview: str = ""  # First 300 characters
    body_sha256: str = ""
    links: list[str] = Field(default_factory=list)
    attachment_names: list[str] = Field(default_factory=list)
    attachment_metadata: list[dict[str, Any]] = Field(default_factory=list)
    received_time: datetime | None = None
    email_hash: str = ""
    source_format: str = "text"  # "eml", "pdf", "text"
    raw_storage_key: str | None = None
    processing_status: str = "parsed"

    def to_storage_payload(self) -> dict:
        """Serializes full email details for Supabase storage."""
        return {
            "message_id": self.message_id,
            "in_reply_to": self.in_reply_to,
            "references": self.references,
            "subject": self.subject,
            "sender_email": self.sender_email,
            "sender_name": self.sender_name,
            "sender_domain": self.sender_domain,
            "body": self.body,
            "body_preview": self.body_preview,
            "body_sha256": self.body_sha256,
            "links": self.links,
            "attachment_names": self.attachment_names,
            "attachment_metadata": self.attachment_metadata,
            "received_time": self.received_time.isoformat() if self.received_time else None,
            "email_hash": self.email_hash,
            "source_format": self.source_format,
            "raw_storage_key": self.raw_storage_key,
        }

    def to_r2_payload(self) -> dict:
        """Alias for to_storage_payload for backward compatibility."""
        return self.to_storage_payload()


class EmailTrainingDataCreate(BaseModel):
    email_hash: str
    thread_id: uuid.UUID | None = None
    message_id: str | None = None
    in_reply_to: str | None = None
    subject: str | None = None
    sender_email: str | None = None
    sender_domain: str | None = None
    sender_name: str | None = None
    body_preview: str | None = None
    storage_key: str
    raw_storage_key: str | None = None
    body_sha256: str
    attachment_metadata: list[dict[str, Any]] | None = None
    company: str | None = None
    role: str | None = None
    category: str | None = None
    confidence: int = 0
    source: str = "api_key"
    classification_source_version: str | None = None
    pipeline_version: str = "interview_pipeline_v2.0"
    needs_retraining: bool = False
    ai_reasoning: str | None = None
    processing_status: str = "pending"
    version: int = 1


class EmailTrainingDataResponse(BaseModel):
    id: uuid.UUID
    version: int = 1
    thread_id: uuid.UUID | None = None
    message_id: str | None = None
    in_reply_to: str | None = None
    email_hash: str
    subject: str | None = None
    sender_email: str | None = None
    sender_domain: str | None = None
    sender_name: str | None = None
    body_preview: str | None = None
    storage_key: str
    raw_storage_key: str | None = None
    body_sha256: str
    attachment_metadata: list[dict[str, Any]] | None = None
    company: str | None = None
    role: str | None = None
    category: str | None = None
    confidence: int = 0
    source: str
    classification_source_version: str | None = None
    pipeline_version: str = "interview_pipeline_v2.0"
    needs_retraining: bool = False
    ai_reasoning: str | None = None
    processing_status: str
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class GroqTeacherResult(BaseModel):
    """Deterministic structured output extracted by the Groq Teacher Engine."""
    it_related: bool = Field(description="Whether email is tech recruitment/application related")
    category: str = Field(description="One of the 13 canonical label taxonomy categories")
    company: str | None = Field(default=None, description="Extracted hiring company name")
    role: str | None = Field(default=None, description="Extracted job title / role")
    round_name: str | None = Field(default=None, description="Company-specific round name (e.g. Bar Raiser, OA, Team Match)")
    round_type: str = Field(default="interview", description="Standardized RoundType value")
    status: str = Field(default="Scheduled", description="Standardized EventStatus value")
    round: str | None = Field(default=None, description="Legacy alias for round_name")
    confidence: int = Field(default=95, description="Calibrated confidence (0-100)")
    meeting_link: str | None = Field(default=None, description="Extracted video conference or scheduling URL")
    deadline: str | None = Field(default=None, description="Extracted deadline or expiry date/time")
    reason: str = Field(description="Brief evidence-based rationale")
    prompt_version: str = Field(default="teacher_v1", description="Prompt version used for inference")


class InterviewEventCreate(BaseModel):
    application_id: uuid.UUID | None = None
    email_id: uuid.UUID | None = None
    thread_id: uuid.UUID | None = None
    event_type: str
    event_sequence: int = 1
    round_name: str | None = None
    round_type: str | None = None
    round: str | None = None
    status: str = "Scheduled"
    scheduled_at: datetime | None = None
    meeting_link: str | None = None
    deadline: str | None = None
    recruiter: str | None = None
    raw_json: dict | None = None


class InterviewEventResponse(BaseModel):
    id: uuid.UUID
    application_id: uuid.UUID | None = None
    email_id: uuid.UUID | None = None
    thread_id: uuid.UUID | None = None
    event_type: str
    event_sequence: int = 1
    round_name: str | None = None
    round_type: str | None = None
    round: str | None = None
    status: str
    scheduled_at: datetime | None = None
    meeting_link: str | None = None
    deadline: str | None = None
    recruiter: str | None = None
    raw_json: dict | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ProcessEmailRequest(BaseModel):
    """Input payload for raw email intake."""
    raw_text: str | None = None
    filename: str | None = None
    client_id: uuid.UUID | None = None


class ProcessEmailResponse(BaseModel):
    """Unified response payload for the ATS Email Intelligence ingestion endpoint."""
    status: str = "success"  # "success", "skipped", "error"
    action: str  # "created_new_interview_event", "updated_existing_event", "application_status_updated", "recorded_rejection", "categorized_only"
    email_id: uuid.UUID
    email_hash: str
    thread_id: uuid.UUID | None = None
    category: str
    confidence: int
    decision: str  # "api_classified"
    source: str  # "api_key", "human", or legacy historical source
    company: str | None = None
    role: str | None = None
    round_name: str | None = None
    round_type: str | None = None
    round: str | None = None
    event_sequence: int | None = None
    event_id: uuid.UUID | None = None
    application_id: uuid.UUID | None = None
    meeting_link: str | None = None
    deadline: str | None = None
    ai_reasoning: str | None = None
    needs_retraining: bool = False
    pipeline_version: str = "interview_pipeline_v2.0"


class ReviewActionCreate(BaseModel):
    email_id: uuid.UUID
    new_label: str
    notes: str | None = None


class ReviewActionResponse(BaseModel):
    id: uuid.UUID
    email_id: uuid.UUID
    reviewer: str
    reviewer_id: uuid.UUID | None = None
    old_label: str | None = None
    new_label: str
    notes: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DashboardMetricsResponse(BaseModel):
    total_processed: int
    auto_accepted: int
    teacher_fallback: int
    needs_review: int
    active_model_version: str
    golden_accuracy: float
    needs_retraining_count: int
    api_classified: int = 0
    human_reviewed: int = 0
    pending_processing: int = 0
    api_keys_configured: int = 0
    api_providers: list[str] = Field(default_factory=list)
    api_model: str | None = None
    pipeline_version: str = "interview_pipeline_v2.0"
    prompt_version: str = "teacher_v1"
    category_breakdown: dict[str, int] = Field(default_factory=dict)


class TimelineInspectorEvent(BaseModel):
    id: uuid.UUID
    thread_id: uuid.UUID | None = None
    event_sequence: int
    event_type: str
    round_name: str | None = None
    round_type: str | None = None
    round: str | None = None
    status: str
    scheduled_at: datetime | None = None
    meeting_link: str | None = None
    deadline: str | None = None
    recruiter: str | None = None
    created_at: datetime
    email_id: uuid.UUID | None = None
    email_subject: str | None = None
    email_preview: str | None = None


class ApplicationTimelineResponse(BaseModel):
    application_id: uuid.UUID
    company: str | None = None
    role: str | None = None
    candidate_name: str | None = None
    current_status: str
    current_round: str | None = None
    events: list[TimelineInspectorEvent] = Field(default_factory=list)

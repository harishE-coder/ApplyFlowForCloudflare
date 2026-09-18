import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ApplicationCreate(BaseModel):
    resume_id: uuid.UUID
    requirement_id: uuid.UUID | None = None
    client_id: uuid.UUID | None = None
    status: str = "Submitted"
    current_round: str | None = "Initial Application"


class ApplicationStatusUpdate(BaseModel):
    status: str
    current_round: str | None = None


class EmailIntakeResponse(BaseModel):
    id: uuid.UUID
    uploaded_by: uuid.UUID
    uploaded_by_name: str | None = None
    client_id: uuid.UUID | None = None
    client_name: str | None = None
    original_text: str
    source_type: str  # "paste", "eml", "pdf", "image"
    processed: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ApplicationEventResponse(BaseModel):
    id: uuid.UUID
    application_id: uuid.UUID
    event_type: str
    round_name: str | None = None
    event_date: datetime | None = None
    email_id: uuid.UUID | None = None
    raw_email: str | None = None
    ai_json: dict | None = None
    interview_date: datetime | None = None
    created_by_id: uuid.UUID | None = None
    created_by_name: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ApplicationResponse(BaseModel):
    id: uuid.UUID
    resume_id: uuid.UUID | None = None
    resume_display_id: str | None = None
    candidate_name: str
    company: str
    role: str
    requirement_id: uuid.UUID | None = None
    requirement_code: str | None = None
    client_id: uuid.UUID | None = None
    client_name: str
    employee_id: uuid.UUID
    employee_name: str
    status: str
    current_round: str | None = "Initial Application"
    interview_date: datetime | None = None
    is_ai_processed: bool = False
    applied_date: datetime
    updated_at: datetime | None = None
    events: list[ApplicationEventResponse] = []

    model_config = {"from_attributes": True}


class ProcessEmailRequest(BaseModel):
    raw_email: str = Field(..., min_length=5, description="Raw recruiter email text or HTML")
    client_id: uuid.UUID | None = None
    source_type: str = "paste"


class AIAnalysisResponse(BaseModel):
    """Returned by analyze-email to determine if Interview Mail vs Not Related."""
    is_interview_mail: bool
    decision: str  # "existing_application", "new_application", "not_related"
    decision_text: str
    candidate_name: str
    company: str
    role: str
    status: str
    round: str
    interview_date: str | None = None
    client_id: uuid.UUID | None = None
    client_name: str | None = None
    raw_email: str
    source_type: str = "paste"
    raw_filename: str | None = None
    matched_application_id: uuid.UUID | None = None
    current_round: str | None = None
    current_status: str | None = None
    # Smart Resume Linking Fields
    matched_resume_id: uuid.UUID | None = None
    matched_resume_name: str | None = None
    matched_resume_candidate: str | None = None
    matched_resume_company: str | None = None
    matched_resume_role: str | None = None
    matched_resume_tag: str | None = None
    resume_matched: bool = False
    match_priority: int | None = None
    match_reason: str | None = None


class ConfirmSaveRequest(BaseModel):
    """Submitted by the user after clicking Confirm."""
    candidate_name: str
    company: str
    role: str
    round: str
    status: str
    interview_date: str | None = None
    client_id: uuid.UUID | None = None
    raw_email: str
    source_type: str = "paste"
    decision: str = "new_application"
    matched_application_id: uuid.UUID | None = None
    resume_id: uuid.UUID | None = None


class ConfirmAIRequest(BaseModel):
    candidate: str | None = None
    company: str | None = None
    role: str | None = None
    status: str | None = None
    round: str | None = None
    interview_date: str | None = None


class ProcessEmailResponse(BaseModel):
    action_type: str  # "new", "follow_up", "ignored"
    extracted_data: dict
    application: ApplicationResponse | None = None
    event: ApplicationEventResponse | None = None
    raw_filename: str | None = None
    message: str | None = None


class ApplicationTimelineResponse(BaseModel):
    application_id: uuid.UUID
    candidate_name: str
    company: str
    role: str
    current_status: str
    current_round: str
    client_name: str
    events: list[ApplicationEventResponse]


class AIInboxItemResponse(BaseModel):
    id: uuid.UUID
    application_id: uuid.UUID
    candidate_name: str
    company: str
    role: str
    resume_display_id: str
    client_id: uuid.UUID | None = None
    client_name: str
    employee_name: str
    status: str
    round: str
    interview_date: datetime | None = None
    action_type: str  # "new", "follow_up"
    raw_email_snippet: str | None = None
    created_at: datetime
    events_count: int = 1


class AIInboxOverviewResponse(BaseModel):
    items: list[AIInboxItemResponse]
    total: int
    page: int = 1
    page_size: int = 20
    total_pages: int = 1
    today_processed: int = 0
    new_count: int = 0
    followup_count: int = 0
    client_breakdown: dict[str, int] = {}


class ApplicationListResponse(BaseModel):
    items: list[ApplicationResponse]
    total: int
    page: int
    page_size: int


class ApplicationNotesUpdate(BaseModel):
    client_notes: str | None = None
    is_note_shared: bool = True


class PipelineStatsResponse(BaseModel):
    total: int = 0
    submitted: int = 0
    interview: int = 0
    offer: int = 0
    rejected: int = 0
    hold: int = 0
    closed: int = 0


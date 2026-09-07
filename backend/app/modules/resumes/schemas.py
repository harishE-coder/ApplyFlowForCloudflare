import uuid
from datetime import date, datetime

from pydantic import BaseModel


class ResumeBase(BaseModel):
    candidate_name: str
    company: str
    role: str
    client_id: uuid.UUID
    requirement_id: uuid.UUID | None = None
    resume_id_tag: str | None = None
    resume_date: date | None = None
    work_date: date | None = None
    client_notes: str | None = None
    is_note_shared: bool = False


class ResumeCreateManual(ResumeBase):
    original_filename: str
    temp_file_id: str | None = None


class ResumeUpdate(BaseModel):
    candidate_name: str | None = None
    company: str | None = None
    role: str | None = None
    client_id: uuid.UUID | None = None
    requirement_id: uuid.UUID | None = None
    resume_id_tag: str | None = None
    resume_date: date | None = None
    work_date: date | None = None
    client_notes: str | None = None
    is_note_shared: bool | None = None


class ResumeResponse(BaseModel):
    id: uuid.UUID
    display_id: str
    candidate_name: str
    company: str
    role: str
    resume_id_tag: str | None = None
    requirement_id: uuid.UUID | None = None
    requirement_code: str | None = None
    client_id: uuid.UUID
    client_name: str
    uploaded_by: uuid.UUID
    uploader_name: str
    original_filename: str
    resume_date: date | None = None
    work_date: date | None = None
    client_notes: str | None = None
    is_note_shared: bool = False
    r2_key: str | None = None
    file_size: int | None = None
    content_type: str | None = "application/pdf"
    expires_at: datetime | None = None
    preview_url: str | None = None
    download_url: str | None = None
    drive_file_id: str | None = None
    drive_url: str | None = None
    upload_date: datetime
    created_at: datetime | None = None
    is_backfilled: bool = False
    delay_days: int = 0
    has_application: bool = False

    model_config = {"from_attributes": True}


class ParsedFileUploadItem(BaseModel):
    filename: str
    status: str  # "saved", "valid", "duplicate", "needs_review", "rejected"
    message: str
    company: str | None = None
    role: str | None = None
    candidate_name: str | None = None
    resume_id_tag: str | None = None
    client_name: str | None = None
    client_id: uuid.UUID | None = None
    requirement_id: uuid.UUID | None = None
    requirement_code: str | None = None
    resume_date: date | None = None
    work_date: date | None = None
    is_backfilled: bool = False
    delay_days: int = 0
    r2_key: str | None = None
    file_size: int | None = None
    drive_file_id: str | None = None
    saved_resume_id: uuid.UUID | None = None
    temp_file_id: str | None = None
    is_duplicate: bool = False


class UploadDashboardStats(BaseModel):
    today_uploads: int
    total_resumes: int


class BulkUploadResponse(BaseModel):
    success: bool = True
    total_files: int
    saved_count: int
    uploaded: int = 0
    needs_review_count: int = 0
    rejected_count: int = 0
    client_synced: bool = True
    dashboard: UploadDashboardStats | None = None
    items: list[ParsedFileUploadItem] = []


class CheckDuplicateFileItem(BaseModel):
    filename: str
    company: str | None = None
    candidate_name: str | None = None
    resume_id_tag: str | None = None


class CheckDuplicatesRequest(BaseModel):
    client_id: uuid.UUID
    items: list[CheckDuplicateFileItem]


class CheckDuplicatesResponse(BaseModel):
    results: list[dict]


class FindResumeMatchResponse(BaseModel):
    matched: bool
    resume_id: uuid.UUID | None = None
    resume_name: str | None = None
    candidate_name: str | None = None
    company: str | None = None
    role: str | None = None
    resume_id_tag: str | None = None
    match_priority: int | None = None  # 1 (Resume ID), 2 (Name + Company), 3 (Name + Role)
    match_reason: str | None = None


class ConfirmManualUploadItem(BaseModel):
    temp_file_id: str
    original_filename: str
    candidate_name: str
    company: str
    role: str
    client_id: uuid.UUID
    requirement_id: uuid.UUID | None = None
    resume_id_tag: str | None = None
    resume_date: date | None = None
    client_notes: str | None = None


class ConfirmManualUploadRequest(BaseModel):
    items: list[ConfirmManualUploadItem]

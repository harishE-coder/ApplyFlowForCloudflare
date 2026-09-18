import uuid

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.modules.applications import service
from app.modules.applications.models import Application
from app.modules.applications.schemas import (
    AIAnalysisResponse,
    AIInboxOverviewResponse,
    ApplicationCreate,
    ApplicationListResponse,
    ApplicationNotesUpdate,
    ApplicationResponse,
    ApplicationStatusUpdate,
    ApplicationTimelineResponse,
    ConfirmAIRequest,
    ConfirmSaveRequest,
    PipelineStatsResponse,
    ProcessEmailRequest,
    ProcessEmailResponse,
)
from app.modules.users.models import User

router = APIRouter(prefix="/api/applications", tags=["applications"])
ai_router = APIRouter(prefix="/api/ai", tags=["ai-inbox"])


# ============================================================================
# TWO-PHASE GROQ AI ANALYZER & HUMAN CONFIRMATION ENDPOINTS
# ============================================================================

@ai_router.post("/analyze-email", response_model=AIAnalysisResponse, status_code=status.HTTP_200_OK)
async def analyze_email(
    payload: ProcessEmailRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Phase 1 (Preview Only): Extract recruitment entities with Groq API and determine
    if new application, follow-up, duplicate, or unknown.
    DOES NOT SAVE TO DATABASE OR POST TO CHAT.
    """
    return await service.analyze_recruiter_email(
        db=db,
        current_user=current_user,
        raw_email=payload.raw_email,
        client_id=payload.client_id,
        source_type=payload.source_type or "paste",
    )


@ai_router.post("/analyze-file", response_model=AIAnalysisResponse, status_code=status.HTTP_200_OK)
async def analyze_file(
    file: UploadFile = File(...),
    client_id: uuid.UUID | None = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Phase 1 (Preview Only): Extract text from .eml, .pdf, .txt, or Screenshot image (OCR),
    and analyze with Groq API without modifying database or sending chat updates.
    """
    return await service.analyze_upload_file(
        db=db,
        current_user=current_user,
        file=file,
        client_id=client_id,
    )


@ai_router.post("/confirm-save", response_model=ProcessEmailResponse, status_code=status.HTTP_200_OK)
async def confirm_save(
    payload: ConfirmSaveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Phase 2 (Execute & Persist): Persist verified candidate update to PostgreSQL,
    create/update application, log email_intake, record timeline event,
    and post automatic update to the Service Client Chat Room.
    """
    return await service.confirm_and_save_email(
        db=db,
        current_user=current_user,
        payload=payload,
    )


# Legacy direct process endpoints (for backward compatibility)
@ai_router.post("/process-email", response_model=ProcessEmailResponse, status_code=status.HTTP_200_OK)
async def process_email(
    payload: ProcessEmailRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Analyze then automatically confirm
    analysis = await service.analyze_recruiter_email(
        db=db,
        current_user=current_user,
        raw_email=payload.raw_email,
        client_id=payload.client_id,
        source_type=payload.source_type or "paste",
    )
    req = ConfirmSaveRequest(
        candidate_name=analysis.candidate_name,
        company=analysis.company,
        role=analysis.role,
        round=analysis.round,
        status=analysis.status,
        interview_date=analysis.interview_date,
        client_id=analysis.client_id,
        raw_email=analysis.raw_email,
        source_type=analysis.source_type,
        confidence=analysis.confidence,
        decision=analysis.decision,
        matched_application_id=analysis.matched_application_id,
    )
    return await service.confirm_and_save_email(db=db, current_user=current_user, payload=req)


@ai_router.post("/upload-email", response_model=ProcessEmailResponse, status_code=status.HTTP_200_OK)
async def upload_email(
    file: UploadFile = File(...),
    client_id: uuid.UUID | None = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    analysis = await service.analyze_upload_file(
        db=db,
        current_user=current_user,
        file=file,
        client_id=client_id,
    )
    req = ConfirmSaveRequest(
        candidate_name=analysis.candidate_name,
        company=analysis.company,
        role=analysis.role,
        round=analysis.round,
        status=analysis.status,
        interview_date=analysis.interview_date,
        client_id=analysis.client_id,
        raw_email=analysis.raw_email,
        source_type=analysis.source_type,
        confidence=analysis.confidence,
        decision=analysis.decision,
        matched_application_id=analysis.matched_application_id,
    )
    return await service.confirm_and_save_email(db=db, current_user=current_user, payload=req)


@ai_router.get("/inbox", response_model=AIInboxOverviewResponse)
@ai_router.get("/history", response_model=AIInboxOverviewResponse)
async def get_ai_inbox(
    client_id: uuid.UUID | None = Query(None),
    status: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Fetch AI Response Inbox feed with aggregated metrics and processing history.
    """
    return await service.get_ai_inbox_feed(
        db=db,
        current_user=current_user,
        client_id=client_id,
        status=status,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.get("/{app_id}/timeline", response_model=ApplicationTimelineResponse)
async def get_timeline(
    app_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Fetch full chronological candidate timeline with all events and raw email snippets.
    """
    return await service.get_application_timeline(
        db=db,
        current_user=current_user,
        app_id=app_id,
    )


@router.post("/{app_id}/confirm-ai", response_model=ApplicationResponse)
async def confirm_ai_extraction(
    app_id: uuid.UUID,
    payload: ConfirmAIRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Confirm or edit low-confidence AI extraction for an application.
    """
    return await service.confirm_ai_event(
        db=db,
        current_user=current_user,
        app_id=app_id,
        payload=payload,
    )


@router.post("", response_model=ApplicationResponse, status_code=status.HTTP_201_CREATED)
async def create_application(
    payload: ApplicationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Direct application creation from Candidate Bank."""
    app = await service.submit_application(
        db=db,
        current_user=current_user,
        payload=payload,
    )
    from sqlalchemy.orm import selectinload
    reloaded = (
        await db.execute(
            select(Application)
            .where(Application.id == app.id)
            .options(selectinload(Application.resume), selectinload(Application.client), selectinload(Application.employee))
        )
    ).scalar_one()

    return ApplicationResponse(
        id=reloaded.id,
        resume_id=reloaded.resume_id,
        resume_display_id=reloaded.resume.display_id if reloaded.resume else "RES-000",
        candidate_name=reloaded.resume.candidate_name if reloaded.resume else "Candidate",
        company=reloaded.resume.company or "Company",
        role=reloaded.resume.role if reloaded.resume else "Role",
        requirement_id=reloaded.requirement_id,
        requirement_code=None,
        client_id=reloaded.client_id,
        client_name=reloaded.client.company_name if reloaded.client else "Client",
        employee_id=reloaded.employee_id,
        employee_name=reloaded.employee.name if reloaded.employee else current_user.name,
        status=reloaded.status,
        current_round=reloaded.current_round,
        interview_date=reloaded.interview_date,
        confidence=reloaded.confidence,
        is_ai_processed=reloaded.is_ai_processed,
        applied_date=reloaded.applied_date,
        updated_at=reloaded.updated_at,
    )


@router.post("/{app_id}/close")
async def close_application(
    app_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Close application (process finished, history preserved)."""
    app = (await db.execute(select(Application).where(Application.id == app_id))).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    app.status = "Closed"
    from app.modules.activity_logs.models import ActivityLog
    db.add(
        ActivityLog(
            user_id=current_user.id,
            action="application_closed",
            details={"application_id": str(app_id)},
        )
    )
    await db.flush()
    return {"message": "Application closed successfully"}


@router.post("/{app_id}/archive")
async def archive_application(
    app_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Archive application."""
    app = (await db.execute(select(Application).where(Application.id == app_id))).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    app.status = "Archived"
    from app.modules.activity_logs.models import ActivityLog
    db.add(
        ActivityLog(
            user_id=current_user.id,
            action="application_archived",
            details={"application_id": str(app_id)},
        )
    )
    await db.flush()
    return {"message": "Application archived successfully"}


@router.delete("/{app_id}")
async def delete_application(
    app_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin-only deletion of application."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden: Only Super Admin can delete applications.")

    app = (await db.execute(select(Application).where(Application.id == app_id))).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    await db.delete(app)

    from app.modules.activity_logs.models import ActivityLog
    db.add(
        ActivityLog(
            user_id=current_user.id,
            action="application_deleted",
            details={"application_id": str(app_id)},
        )
    )
    await db.flush()
    return {"message": "Application deleted successfully"}


@router.get("", response_model=ApplicationListResponse)
async def get_applications(
    client_id: uuid.UUID | None = Query(None),
    requirement_id: uuid.UUID | None = Query(None),
    employee_id: uuid.UUID | None = Query(None),
    status: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List applications with filtering and pagination."""
    items, total = await service.list_applications(
        db=db,
        current_user=current_user,
        client_id=client_id,
        requirement_id=requirement_id,
        employee_id=employee_id,
        status=status,
        search=search,
        page=page,
        page_size=page_size,
    )
    return ApplicationListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/stats", response_model=PipelineStatsResponse)
async def get_pipeline_stats_endpoint(
    client_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get application pipeline stats grouped by stage."""
    stats = await service.get_pipeline_stats(
        db=db,
        current_user=current_user,
        client_id=client_id,
    )
    return PipelineStatsResponse(**stats)


@router.patch("/{app_id}/status")
@router.put("/{app_id}/status")
async def update_status_endpoint(
    app_id: uuid.UUID,
    payload: ApplicationStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update application pipeline status."""
    app = await service.update_application_status(
        db=db,
        current_user=current_user,
        app_id=app_id,
        status_val=payload.status,
        current_round=payload.current_round,
    )
    return {"message": "Status updated successfully", "status": app.status}


@router.patch("/{app_id}/notes")
@router.put("/{app_id}/notes")
async def update_notes_endpoint(
    app_id: uuid.UUID,
    payload: ApplicationNotesUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update client notes for an application."""
    await service.update_application_notes(
        db=db,
        current_user=current_user,
        app_id=app_id,
        client_notes=payload.client_notes,
        is_note_shared=payload.is_note_shared,
    )
    return {"message": "Notes updated successfully"}


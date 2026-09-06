"""
FastAPI Router for the Interview Intelligence Subsystem:
- GET   /api/interview-intelligence/dashboard: Live counters, API-key model, and category telemetry
- GET   /api/interview-intelligence/timeline/{application_id}: Sequential application timeline inspector
- GET   /api/interview-intelligence/emails/search: Comprehensive full-text & filter search across recruiter emails
- PATCH /api/interview-intelligence/emails/{id}: Human manual correction with ReviewAction audit trail
- POST  /api/interview-intelligence/process-email: Unified ingestion endpoint (raw text / paste)
- POST  /api/interview-intelligence/upload-file: Multipart file upload (.eml, .pdf, .txt)
- GET   /api/interview-intelligence/model-status: API-key classifier status
"""

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
from pydantic import BaseModel
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ai_gateway import AIServiceUnavailable, ai_gateway
from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.modules.applications.models import Application
from app.modules.interview_intelligence.models import (
    EmailTrainingData,
    InterviewEvent,
    ReviewAction,
)
from app.modules.interview_intelligence.orchestrator import (
    InterviewPipelineOrchestrator,
)
from app.modules.interview_intelligence.schemas import (
    ApplicationTimelineResponse,
    DashboardMetricsResponse,
    EmailTrainingDataResponse,
    ProcessEmailRequest,
    ProcessEmailResponse,
    TimelineInspectorEvent,
)
from app.modules.users.models import User

router = APIRouter(prefix="/api/interview-intelligence", tags=["Interview Intelligence"])


class ManualCorrectionRequest(BaseModel):
    new_label: str
    notes: str | None = None


@router.get(
    "/dashboard",
    response_model=DashboardMetricsResponse,
    summary="Get live telemetry metrics and counters for the Interview Intelligence Dashboard",
)
async def get_dashboard_metrics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Computes real-time counters for the API-key intake dashboard."""
    # 1. Total processed emails
    total_res = await db.execute(select(func.count(EmailTrainingData.id)))
    total_processed = total_res.scalar() or 0

    # 2. API-key classified intake records.
    api_res = await db.execute(
        select(func.count(EmailTrainingData.id)).where(
            EmailTrainingData.source.in_(["api_key", "groq"])
        )
    )
    api_classified = api_res.scalar() or 0

    # 3. Human-reviewed audit records.
    human_res = await db.execute(
        select(func.count(EmailTrainingData.id)).where(
            EmailTrainingData.source == "human"
        )
    )
    human_reviewed = human_res.scalar() or 0

    # 4. Pending or failed processing records.
    pending_res = await db.execute(
        select(func.count(EmailTrainingData.id)).where(
            EmailTrainingData.processing_status.in_(["pending", "failed"])
        )
    )
    pending_processing = pending_res.scalar() or 0

    # 5. Category breakdown.
    cat_res = await db.execute(
        select(EmailTrainingData.category, func.count(EmailTrainingData.id))
        .group_by(EmailTrainingData.category)
    )
    category_breakdown = {cat: count for cat, count in cat_res.all() if cat}

    providers = ai_gateway.get_available_providers()
    primary_model = providers[0].model if providers else settings.groq_model

    return DashboardMetricsResponse(
        total_processed=total_processed,
        auto_accepted=api_classified,
        teacher_fallback=0,
        needs_review=pending_processing,
        active_model_version=primary_model,
        golden_accuracy=0.0,
        needs_retraining_count=0,
        api_classified=api_classified,
        human_reviewed=human_reviewed,
        pending_processing=pending_processing,
        api_keys_configured=len(providers),
        api_providers=[p.key_id for p in providers],
        api_model=primary_model,
        pipeline_version="interview_pipeline_v2.0",
        prompt_version="teacher_v1",
        category_breakdown=category_breakdown,
    )


@router.get(
    "/timeline/{application_id}",
    response_model=ApplicationTimelineResponse,
    summary="Inspect reconstructed interview timeline for an application",
)
async def get_application_timeline(
    application_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns chronologically ordered interview events for an application with email context."""
    app_res = await db.execute(select(Application).where(Application.id == application_id))
    app = app_res.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")

    events_res = await db.execute(
        select(InterviewEvent)
        .where(InterviewEvent.application_id == application_id)
        .order_by(InterviewEvent.event_sequence.asc(), InterviewEvent.created_at.asc())
    )
    events = events_res.scalars().all()

    timeline_events = []
    for ev in events:
        email_subj = None
        email_prev = None
        if ev.training_email:
            email_subj = ev.training_email.subject
            email_prev = ev.training_email.body_preview

        timeline_events.append(
            TimelineInspectorEvent(
                id=ev.id,
                event_sequence=ev.event_sequence,
                event_type=ev.event_type,
                round_name=ev.round_name or ev.round,
                round_type=ev.round_type or ev.event_type,
                round=ev.round_name or ev.round,
                status=ev.status,
                scheduled_at=ev.scheduled_at,
                meeting_link=ev.meeting_link,
                deadline=ev.deadline,
                recruiter=ev.recruiter,
                created_at=ev.created_at,
                email_id=ev.email_id,
                email_subject=email_subj,
                email_preview=email_prev,
            )
        )

    return ApplicationTimelineResponse(
        application_id=app.id,
        company=app.company,
        role=app.role,
        candidate_name=app.candidate_name,
        current_status=app.status,
        current_round=app.current_round,
        events=timeline_events,
    )


@router.get(
    "/emails/search",
    response_model=list[EmailTrainingDataResponse],
    summary="Search recruiter emails across company, role, sender, category, and message-id",
)
async def search_emails(
    q: str | None = Query(None, description="Free text search on subject, company, role, sender"),
    category: str | None = Query(None, description="Filter by category"),
    source: str | None = Query(None, description="Filter by source (api_key, human, or historical source)"),
    needs_retraining: bool | None = Query(None, description="Filter by retraining status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Searches email intake and classification records with composable filters."""
    query = select(EmailTrainingData).order_by(desc(EmailTrainingData.created_at))

    if q and q.strip():
        search_pattern = f"%{q.strip()}%"
        query = query.where(
            or_(
                EmailTrainingData.subject.ilike(search_pattern),
                EmailTrainingData.company.ilike(search_pattern),
                EmailTrainingData.role.ilike(search_pattern),
                EmailTrainingData.sender_email.ilike(search_pattern),
                EmailTrainingData.sender_domain.ilike(search_pattern),
                EmailTrainingData.message_id.ilike(search_pattern),
            )
        )

    if category:
        query = query.where(EmailTrainingData.category == category)

    if source:
        query = query.where(EmailTrainingData.source == source)

    if needs_retraining is not None:
        query = query.where(EmailTrainingData.needs_retraining == needs_retraining)

    query = query.limit(limit).offset(offset)
    res = await db.execute(query)
    return res.scalars().all()


@router.patch(
    "/emails/{email_id}",
    response_model=EmailTrainingDataResponse,
    summary="Manually correct or verify email label and write to ReviewAction audit log",
)
async def update_email_label(
    email_id: uuid.UUID,
    payload: ManualCorrectionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Updates email classification label with source='human' and logs a ReviewAction audit entry.
    """
    res = await db.execute(select(EmailTrainingData).where(EmailTrainingData.id == email_id))
    email_rec = res.scalar_one_or_none()
    if not email_rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Email record not found.")

    old_label = email_rec.category
    new_label = payload.new_label.strip().lower()

    # Record ReviewAction Audit Entry
    action_log = ReviewAction(
        id=uuid.uuid4(),
        email_id=email_rec.id,
        reviewer=current_user.name or current_user.email,
        reviewer_id=current_user.id,
        old_label=old_label,
        new_label=new_label,
        notes=payload.notes,
    )
    db.add(action_log)

    # Update EmailTrainingData as an audit correction only.
    email_rec.category = new_label
    email_rec.source = "human"
    email_rec.classification_source_version = f"human_{current_user.role}"
    email_rec.needs_retraining = False
    email_rec.version += 1
    db.add(email_rec)

    await db.commit()
    await db.refresh(email_rec)
    return email_rec


@router.post(
    "/process-email",
    response_model=ProcessEmailResponse,
    status_code=status.HTTP_200_OK,
    summary="Process email text through the complete Interview Intelligence Pipeline",
)
async def process_email(
    request: ProcessEmailRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ingests and processes raw recruiter email text or snippet."""
    if not request.raw_text or not request.raw_text.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="raw_text cannot be empty.")

    try:
        response = await InterviewPipelineOrchestrator.process_email(
            session=db,
            content=request.raw_text,
            filename=request.filename,
            client_id=request.client_id,
            uploader_id=current_user.id,
        )
        return response
    except AIServiceUnavailable as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Interview pipeline ingestion failed: {e!s}",
        )


@router.post(
    "/upload-file",
    response_model=ProcessEmailResponse,
    status_code=status.HTTP_200_OK,
    summary="Upload .eml / .pdf / .txt file for Interview Intelligence processing",
)
async def upload_email_file(
    file: UploadFile = File(...),
    client_id: uuid.UUID | None = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Accepts raw .eml, .pdf, or .txt file upload and processes through the pipeline."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

    try:
        response = await InterviewPipelineOrchestrator.process_email(
            session=db,
            content=content,
            filename=file.filename,
            mime_type=file.content_type,
            client_id=client_id,
            uploader_id=current_user.id,
        )
        return response
    except AIServiceUnavailable as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"File processing failed: {e!s}",
        )


@router.get(
    "/model-status",
    summary="Get current API-key classifier and pipeline status",
)
async def get_model_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns API-key classifier status."""
    providers = ai_gateway.get_available_providers()
    primary = providers[0] if providers else None

    return {
        "pipeline_version": "interview_pipeline_v2.0",
        "classifier_mode": "api_key",
        "api_keys_configured": len(providers),
        "providers": [p.key_id for p in providers],
        "primary_provider": primary.name if primary else None,
        "primary_model": primary.model if primary else settings.groq_model,
        "prompt_version": "teacher_v1",
        "active_model_version": primary.model if primary else "api_key_not_configured",
        "decision_thresholds": None,
        "storage_provider": "supabase",
        "storage_bucket": "applyflow-storage",
    }

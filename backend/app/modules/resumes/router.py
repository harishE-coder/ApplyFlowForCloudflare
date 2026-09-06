import io
import uuid
from datetime import date

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import RedirectResponse
from fastapi.responses import Response as FastAPIResponse
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.modules.resumes import service
from app.modules.resumes.schemas import (
    BulkUploadResponse,
    CheckDuplicatesRequest,
    CheckDuplicatesResponse,
    ConfirmManualUploadRequest,
    ResumeResponse,
    ResumeUpdate,
)
from app.modules.users.models import User
from app.services.google_drive import drive_service
from app.services.r2_storage import r2_storage

router = APIRouter(prefix="/api/resumes", tags=["resumes"])


@router.get("/companies", response_model=list[str])
async def get_companies(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get list of distinct target companies (TCS, Infosys, Amazon, etc.) for filtering."""
    return await service.get_unique_companies(db, current_user)


@router.post("/check-duplicates", response_model=CheckDuplicatesResponse)
async def check_duplicates(
    payload: CheckDuplicatesRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Pre-commit duplicate detection for candidate batches."""
    results = await service.check_duplicates(
        db=db,
        client_id=payload.client_id,
        items=[it.model_dump() for it in payload.items],
    )
    return CheckDuplicatesResponse(results=results)


@router.get("/find-match")
async def find_resume_match(
    client_id: uuid.UUID = Query(..., description="Service Client ID"),
    candidate_name: str | None = Query(None, description="Candidate name"),
    company: str | None = Query(None, description="Target hiring company"),
    role: str | None = Query(None, description="Role / position"),
    resume_id_tag: str | None = Query(None, description="Resume tag / ID e.g. RES101"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Smart Resume Linking endpoint (Priority 1: Tag -> 2: Name+Company -> 3: Name+Role -> 4: Unmatched).
    Strictly isolated within the given client_id.
    """
    return await service.find_matching_resume(
        db=db,
        client_id=client_id,
        candidate_name=candidate_name,
        company=company,
        role=role,
        resume_id_tag=resume_id_tag,
    )


@router.get("")
async def search_resumes(
    search: str | None = Query(None, description="General search keyword"),
    client_id: uuid.UUID | None = Query(None, description="Filter by Service Client ID"),
    requirement_id: uuid.UUID | None = Query(None, description="Filter by requirement ID"),
    company: str | None = Query(None, description="Filter by target company (TCS, Infosys)"),
    role: str | None = Query(None, description="Filter by role"),
    candidate_name: str | None = Query(None, description="Filter by candidate name"),
    resume_id_tag: str | None = Query(None, description="Filter by Resume ID / Tag"),
    resume_date: str | None = Query(None, description="Filter by specific upload date (YYYY-MM-DD)"),
    date_filter: str | None = Query(None, description="Date filter preset (today, yesterday, this_week, this_month, custom)"),
    custom_date: str | None = Query(None, description="Custom date (YYYY-MM-DD)"),
    start_date: str | None = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="End date (YYYY-MM-DD)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Search resumes with strict permission scoping & global date filtering:
    - Admin: searches all resumes, filterable by Service Client, Company, and Resume Date
    - Employee: searches only assigned Service Clients, filterable by Company and Resume Date
    - Client: searches only own Service Client account resumes, filterable by Company and Resume Date
    """
    offset = (page - 1) * page_size
    items, total = await service.search_resumes(
        db=db,
        current_user=current_user,
        search=search,
        client_id=client_id,
        requirement_id=requirement_id,
        company=company,
        role=role,
        candidate_name=candidate_name,
        resume_id_tag=resume_id_tag,
        resume_date=resume_date,
        date_filter=date_filter,
        custom_date=custom_date,
        start_date=start_date,
        end_date=end_date,
        limit=page_size,
        offset=offset,
    )
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if total > 0 else 1,
    }

@router.post("/upload", response_model=BulkUploadResponse)
async def upload_resumes_bulk(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    client_id: uuid.UUID = Form(...),
    resume_date: date | None = Form(None),
    requirement_id: uuid.UUID | None = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Bulk upload resumes into selected Service Client.
    Only Employees can upload resumes (Admin cannot upload).
    """
    if current_user.role != "employee":
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Only Recruiters can upload resumes.",
        )
    return await service.process_bulk_upload(
        db=db,
        current_user=current_user,
        files=files,
        client_id=client_id,
        resume_date=resume_date,
        requirement_id=requirement_id,
        background_tasks=background_tasks,
    )


@router.post("/confirm-manual", response_model=list[ResumeResponse])
async def confirm_manual(
    payload: ConfirmManualUploadRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Confirm metadata for files needing manual review."""
    return await service.confirm_manual_uploads(
        db=db,
        current_user=current_user,
        items=payload.items,
        background_tasks=background_tasks,
    )


@router.get("/{resume_id}", response_model=ResumeResponse)
async def get_resume(
    resume_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    resume = await service.get_resume_by_id(db, resume_id, current_user)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    items, _ = await service.search_resumes(
        db=db, current_user=current_user, resume_id_tag=resume.resume_id_tag or str(resume.id), limit=1
    )
    if items:
        return items[0]

    return ResumeResponse(
        id=resume.id,
        display_id=resume.display_id,
        candidate_name=resume.candidate_name,
        company=resume.company or "General",
        role=resume.role,
        resume_id_tag=resume.resume_id_tag,
        requirement_id=resume.requirement_id,
        client_id=resume.client_id,
        client_name="Client",
        uploaded_by=resume.uploaded_by,
        uploader_name="Recruiter",
        original_filename=resume.original_filename,
        upload_date=resume.upload_date,
    )


@router.get("/{resume_id}/preview")
async def preview_resume(
    resume_id: uuid.UUID,
    stream: bool = Query(False, description="Stream binary directly instead of redirecting to presigned R2 URL"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Preview resume:
    - If stored in Cloudflare R2: Redirects (307) directly to Cloudflare R2 presigned preview URL (or streams if stream=True).
    - If legacy file: Streams valid PDF binary bytes with application/pdf header.
    Never returns HTML.
    """
    resume = await service.get_resume_by_id(db, resume_id, current_user)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    r2_key = getattr(resume, "r2_key", None)
    if r2_key:
        if not stream:
            presigned_url = r2_storage.get_presigned_preview_url(
                r2_key=r2_key,
                original_filename=resume.original_filename,
            )
            if presigned_url:
                return RedirectResponse(url=presigned_url, status_code=307)

        # Direct streaming fallback (or stream=True requested)
        file_bytes, mime_type = r2_storage.get_file_bytes(
            r2_key=r2_key,
            original_filename=resume.original_filename,
        )
        return FastAPIResponse(
            content=file_bytes,
            media_type=mime_type or "application/pdf",
            headers={
                "Content-Disposition": f'inline; filename="{resume.original_filename}"',
                "Cache-Control": "public, max-age=3600",
            },
        )

    # Legacy Google Drive / local storage fallback
    file_bytes, mime_type = await drive_service.get_file_bytes(
        file_id=resume.drive_file_id,
        original_filename=resume.original_filename,
    )

    return FastAPIResponse(
        content=file_bytes,
        media_type=mime_type or "application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{resume.original_filename}"',
            "Cache-Control": "public, max-age=3600",
        },
    )


@router.get("/{resume_id}/download")
async def download_resume(
    resume_id: uuid.UUID,
    stream: bool = Query(False, description="Stream binary directly instead of redirecting to presigned R2 URL"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Download raw resume file:
    - If stored in Cloudflare R2: Redirects (307) directly to Cloudflare R2 presigned attachment download URL.
    - If legacy file: Streams with attachment Content-Disposition.
    """
    resume = await service.get_resume_by_id(db, resume_id, current_user)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    r2_key = getattr(resume, "r2_key", None)
    if r2_key:
        if not stream:
            presigned_url = r2_storage.get_presigned_download_url(
                r2_key=r2_key,
                original_filename=resume.original_filename,
            )
            if presigned_url:
                return RedirectResponse(url=presigned_url, status_code=307)

        file_bytes, mime_type = r2_storage.get_file_bytes(
            r2_key=r2_key,
            original_filename=resume.original_filename,
        )
        return StreamingResponse(
            io.BytesIO(file_bytes),
            media_type=mime_type or "application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{resume.original_filename}"'
            },
        )

    # Legacy Google Drive / local storage fallback
    file_bytes, mime_type = await drive_service.get_file_bytes(
        file_id=resume.drive_file_id,
        original_filename=resume.original_filename,
    )

    return StreamingResponse(
        io.BytesIO(file_bytes),
        media_type=mime_type,
        headers={
            "Content-Disposition": f'attachment; filename="{resume.original_filename}"'
        },
    )


@router.put("/{resume_id}", response_model=ResumeResponse, dependencies=[Depends(require_role("admin", "sub_admin", "employee"))])
@router.patch("/{resume_id}", response_model=ResumeResponse, dependencies=[Depends(require_role("admin", "sub_admin", "employee"))])
async def update_resume_endpoint(
    resume_id: uuid.UUID,
    payload: ResumeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update resume metadata / move client."""
    await service.update_resume(db, resume_id, payload, current_user)
    res = await service.get_resume_response_by_id(db, resume_id, current_user)
    if not res:
        raise HTTPException(status_code=404, detail="Resume not found")
    return res


@router.delete("/{resume_id}", dependencies=[Depends(require_role("admin", "sub_admin", "employee"))])
async def delete_resume(
    resume_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete resume from database and Cloudflare R2."""
    return await service.delete_resume(db, resume_id, current_user)


@router.post("/cleanup", dependencies=[Depends(require_role("admin"))])
async def cleanup_resumes_endpoint(
    retention_days: int | None = Query(None, description="Optional retention days override (e.g. 120)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Trigger automatic retention cleanup of expired resumes from Cloudflare R2 and database.
    Only Super Administrators can invoke this endpoint.
    """
    return await service.cleanup_expired_resumes(db, current_user, retention_days)


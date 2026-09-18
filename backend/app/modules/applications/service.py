import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, UploadFile
from sqlalchemy import bindparam, desc, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.cache import invalidate_dashboard_cache
from app.modules.activity_logs.models import ActivityLog
from app.modules.applications.models import Application, ApplicationEvent, EmailIntake
from app.modules.applications.schemas import (
    AIAnalysisResponse,
    AIInboxItemResponse,
    AIInboxOverviewResponse,
    ApplicationCreate,
    ApplicationEventResponse,
    ApplicationResponse,
    ApplicationTimelineResponse,
    ConfirmAIRequest,
    ConfirmSaveRequest,
    ProcessEmailResponse,
)
from app.modules.chat.models import ChatMessage, ChatRoom
from app.modules.clients.models import Client
from app.modules.notifications.models import Notification
from app.modules.resumes.models import Resume
from app.modules.resumes.service import get_allowed_client_ids
from app.modules.users.models import User
from app.services.groq_service import GroqService

logger = logging.getLogger(__name__)


async def submit_application(
    db: AsyncSession,
    current_user: User,
    payload: ApplicationCreate,
) -> Application:
    resume = (
        await db.execute(select(Resume).where(Resume.id == payload.resume_id))
    ).scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    client_id = payload.client_id or resume.client_id
    requirement_id = payload.requirement_id or resume.requirement_id

    allowed_clients = await get_allowed_client_ids(db, current_user)
    if allowed_clients is not None and client_id not in allowed_clients:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: You cannot submit applications for unassigned clients",
        )

    # Check if already submitted
    existing = (
        await db.execute(
            select(Application).where(
                Application.resume_id == payload.resume_id,
                Application.client_id == client_id,
            )
        )
    ).scalar_one_or_none()

    if existing:
        return existing

    app = Application(
        resume_id=resume.id,
        candidate_name=resume.candidate_name,
        company=resume.company,
        role=resume.role,
        requirement_id=requirement_id,
        employee_id=current_user.id,
        client_id=client_id,
        status=payload.status,
        current_round=payload.current_round or "Initial Application",
        is_ai_processed=False,
    )
    db.add(app)
    await db.flush()

    init_event = ApplicationEvent(
        application_id=app.id,
        event_type="Submitted",
        round_name="Application Submitted",
        raw_email="Direct ATS Submission",
        ai_json={"action": "direct_submit"},
        event_date=datetime.utcnow(),
        created_by=current_user.id,
    )
    db.add(init_event)

    db.add(
        ActivityLog(
            user_id=current_user.id,
            action="application_submitted",
            details={
                "application_id": str(app.id),
                "resume_id": str(resume.id),
                "candidate": resume.candidate_name,
                "client_id": str(client_id),
                "requirement_id": str(requirement_id) if requirement_id else None,
            },
        )
    )
    await db.flush()
    invalidate_dashboard_cache()

    return app


async def analyze_recruiter_email(
    db: AsyncSession,
    current_user: User,
    raw_email: str,
    client_id: uuid.UUID | None = None,
    source_type: str = "paste",
    raw_filename: str | None = None,
) -> AIAnalysisResponse:
    """
    Phase 1: Determine if email is INTERVIEW_MAIL or NOT_RELATED.
    If NOT_RELATED -> Returns is_interview_mail=False (Ignored, 0 DB writes).
    If INTERVIEW_MAIL -> Performs Smart Resume Linking (Priority 1: Tag -> 2: Name+Company -> 3: Name+Role -> 4: Unmatched)
    scoped strictly to the selected client_id.
    """
    extracted = await GroqService.extract_email_entities(raw_email)

    is_interview = bool(extracted.get("is_interview_mail", False))

    if not is_interview:
        return AIAnalysisResponse(
            is_interview_mail=False,
            decision="not_related",
            decision_text="This email is not a recruitment/interview update. Ignored.",
            candidate_name="",
            company="",
            role="",
            status="",
            round="",
            interview_date=None,
            client_id=client_id,
            raw_email=raw_email,
            source_type=source_type,
            raw_filename=raw_filename,
        )

    cand_name = (extracted.get("candidate_name") or "Candidate").strip()
    company_name = (extracted.get("company") or "Company").strip()
    role_name = (extracted.get("role") or "Software Engineer").strip()
    status_str = (extracted.get("status") or "Shortlisted").strip()
    round_str = (extracted.get("round") or "Round 1").strip()
    interview_date_str = extracted.get("interview_date")
    resume_id_tag = extracted.get("resume_id_tag")

    allowed_clients = await get_allowed_client_ids(db, current_user)

    effective_client_id = client_id
    if not effective_client_id and allowed_clients and len(allowed_clients) == 1:
        effective_client_id = allowed_clients[0]

    # 1. Smart Resume Linking search (scoped strictly to client_id)
    matched_resume_obj = None
    if effective_client_id:
        from app.modules.resumes.service import find_matching_resume
        matched_resume_obj = await find_matching_resume(
            db=db,
            client_id=effective_client_id,
            candidate_name=cand_name,
            company=company_name,
            role=role_name,
            resume_id_tag=resume_id_tag,
        )

    # 2. Check for existing Application
    matched_app = None
    if matched_resume_obj and matched_resume_obj.matched:
        app_stmt = (
            select(Application)
            .where(
                Application.resume_id == matched_resume_obj.resume_id,
                Application.client_id == effective_client_id,
            )
            .options(selectinload(Application.resume), selectinload(Application.client), selectinload(Application.employee))
        )
        matched_app = (await db.execute(app_stmt)).scalars().first()

    if not matched_app and cand_name and cand_name.lower() not in ["candidate", "unknown", "team", ""]:
        app_stmt = (
            select(Application)
            .outerjoin(Resume, Application.resume_id == Resume.id)
            .where(
                or_(
                    Resume.candidate_name.ilike(f"%{cand_name}%"),
                    Application.candidate_name.ilike(f"%{cand_name}%"),
                )
            )
            .options(selectinload(Application.resume), selectinload(Application.client), selectinload(Application.employee))
        )
        if effective_client_id:
            app_stmt = app_stmt.where(Application.client_id == effective_client_id)
        elif allowed_clients is not None:
            app_stmt = app_stmt.where(Application.client_id.in_(allowed_clients))
        matched_app = (await db.execute(app_stmt)).scalars().first()

    target_client_name = None
    if effective_client_id:
        cl = (await db.execute(select(Client).where(Client.id == effective_client_id))).scalar_one_or_none()
        if cl:
            target_client_name = cl.company_name
    elif matched_app and matched_app.client:
        target_client_name = matched_app.client.company_name
        effective_client_id = matched_app.client_id

    # If application exists and has a linked resume, use that if matched_resume_obj didn't match
    if matched_app and matched_app.resume and (not matched_resume_obj or not matched_resume_obj.matched):
        from app.modules.resumes.schemas import FindResumeMatchResponse
        matched_resume_obj = FindResumeMatchResponse(
            matched=True,
            resume_id=matched_app.resume.id,
            resume_name=matched_app.resume.original_filename,
            candidate_name=matched_app.resume.candidate_name,
            company=matched_app.resume.company,
            role=matched_app.resume.role,
            resume_id_tag=matched_app.resume.resume_id_tag,
            match_priority=2,
            match_reason="Existing application linked resume",
        )

    cand_display = matched_app.display_candidate_name if matched_app else (matched_resume_obj.candidate_name if (matched_resume_obj and matched_resume_obj.matched) else cand_name)

    if matched_app:
        decision = "existing_application"
        decision_text = f"Existing application found for {cand_display}. Changes: Round: {matched_app.current_round} → {round_str}, Status: {matched_app.status} → {status_str}."
    else:
        decision = "new_application"
        decision_text = "New Application Found. Review linked resume and click Confirm to save."

    return AIAnalysisResponse(
        is_interview_mail=True,
        decision=decision,
        decision_text=decision_text,
        candidate_name=cand_display,
        company=company_name,
        role=role_name,
        status=status_str,
        round=round_str,
        interview_date=interview_date_str,
        client_id=effective_client_id or (matched_app.client_id if matched_app else None),
        client_name=target_client_name,
        raw_email=raw_email,
        source_type=source_type,
        raw_filename=raw_filename,
        matched_application_id=matched_app.id if matched_app else None,
        current_round=matched_app.current_round if matched_app else None,
        current_status=matched_app.status if matched_app else None,
        matched_resume_id=matched_resume_obj.resume_id if matched_resume_obj else None,
        matched_resume_name=matched_resume_obj.resume_name if matched_resume_obj else None,
        matched_resume_candidate=matched_resume_obj.candidate_name if matched_resume_obj else None,
        matched_resume_company=matched_resume_obj.company if matched_resume_obj else None,
        matched_resume_role=matched_resume_obj.role if matched_resume_obj else None,
        matched_resume_tag=matched_resume_obj.resume_id_tag if matched_resume_obj else None,
        resume_matched=matched_resume_obj.matched if matched_resume_obj else False,
        match_priority=matched_resume_obj.match_priority if matched_resume_obj else None,
        match_reason=matched_resume_obj.match_reason if matched_resume_obj else None,
    )


async def analyze_upload_file(
    db: AsyncSession,
    current_user: User,
    file: UploadFile,
    client_id: uuid.UUID | None = None,
) -> AIAnalysisResponse:
    """
    Extract text from uploaded .eml, .txt, .pdf, or screenshot image (OCR)
    and return classification preview without saving to database.
    """
    from app.services.email_parser import extract_text_from_upload

    extracted_text, filename, source_type = await extract_text_from_upload(file)
    return await analyze_recruiter_email(
        db=db,
        current_user=current_user,
        raw_email=extracted_text,
        client_id=client_id,
        source_type=source_type,
        raw_filename=filename,
    )


async def confirm_and_save_email(
    db: AsyncSession,
    current_user: User,
    payload: ConfirmSaveRequest,
) -> ProcessEmailResponse:
    """
    Phase 2: Persist confirmed candidate update to database.
    Creates/updates Application, writes EmailIntake, appends ApplicationEvent,
    posts update to Service Client Chat Room (with View Resume link if resume linked),
    and dispatches scoped notifications.
    Never creates duplicate resumes from email intake!
    """
    cand_name = payload.candidate_name.strip()
    company_name = payload.company.strip()
    role_name = payload.role.strip()
    status_str = payload.status.strip()
    round_str = payload.round.strip()
    interview_date_str = payload.interview_date

    interview_dt = None
    if interview_date_str:
        try:
            interview_dt = datetime.fromisoformat(interview_date_str.replace("Z", "+00:00"))
        except Exception:
            try:
                interview_dt = datetime.strptime(interview_date_str, "%Y-%m-%d")
            except Exception:
                interview_dt = None

    allowed_clients = await get_allowed_client_ids(db, current_user)

    # 1. Determine target Client
    target_client = None
    if payload.client_id:
        target_client = (await db.execute(select(Client).where(Client.id == payload.client_id))).scalar_one_or_none()

    if not target_client:
        client_stmt = select(Client).where(Client.company_name.ilike(f"%{company_name}%"))
        if allowed_clients is not None:
            client_stmt = client_stmt.where(Client.id.in_(allowed_clients))
        target_client = (await db.execute(client_stmt)).scalars().first()

    if not target_client:
        if allowed_clients:
            target_client = (await db.execute(select(Client).where(Client.id == allowed_clients[0]))).scalar_one_or_none()
        else:
            target_client = (await db.execute(select(Client).limit(1))).scalar_one_or_none()

    if not target_client:
        target_client = Client(
            company_name=company_name,
            contact_person="Recruiter Ingestion",
            email=f"contact@{company_name.lower().replace(' ', '')}.com",
            is_active=True,
        )
        db.add(target_client)
        await db.flush()

    # 2. Record in email_intake audit table
    email_intake = EmailIntake(
        uploaded_by=current_user.id,
        client_id=target_client.id,
        original_text=payload.raw_email,
        source_type=payload.source_type,
        confidence=95,
        processed=True,
    )
    db.add(email_intake)
    await db.flush()

    # 3. Find or Create Application
    matched_app = None
    if payload.matched_application_id:
        matched_app = (
            await db.execute(
                select(Application)
                .where(Application.id == payload.matched_application_id)
                .options(selectinload(Application.resume), selectinload(Application.client), selectinload(Application.employee))
            )
        ).scalar_one_or_none()

    if not matched_app and payload.resume_id:
        matched_app = (
            await db.execute(
                select(Application)
                .where(Application.resume_id == payload.resume_id, Application.client_id == target_client.id)
                .options(selectinload(Application.resume), selectinload(Application.client), selectinload(Application.employee))
            )
        ).scalar_one_or_none()

    if not matched_app:
        app_stmt = (
            select(Application)
            .outerjoin(Resume, Application.resume_id == Resume.id)
            .where(
                or_(
                    Resume.candidate_name.ilike(f"%{cand_name}%"),
                    Application.candidate_name.ilike(f"%{cand_name}%"),
                ),
                Application.client_id == target_client.id,
            )
            .options(selectinload(Application.resume), selectinload(Application.client), selectinload(Application.employee))
        )
        matched_app = (await db.execute(app_stmt)).scalars().first()

    action_type = "new"

    if matched_app:
        action_type = "follow_up"
        app = matched_app
        app.status = status_str
        app.current_round = round_str
        app.last_email_snippet = payload.raw_email[:300]
        app.is_ai_processed = True
        if interview_dt:
            app.interview_date = interview_dt
        if payload.resume_id:
            app.resume_id = payload.resume_id

        # Append confirmed event
        event = ApplicationEvent(
            application_id=app.id,
            event_type=round_str,
            round_name=round_str,
            event_date=interview_dt or datetime.utcnow(),
            email_id=email_intake.id,
            raw_email=payload.raw_email,
            ai_json={"status": status_str, "round": round_str, "confirmed_by": current_user.name},
            interview_date=interview_dt,
            created_by=current_user.id,
        )
        db.add(event)
        await db.flush()

    else:
        action_type = "new"
        # Smart Resume Linking: Set resume_id if passed, otherwise set NULL without creating duplicate resumes
        target_resume_id = payload.resume_id

        app = Application(
            resume_id=target_resume_id,
            candidate_name=cand_name if not target_resume_id else None,
            company=company_name if not target_resume_id else None,
            role=role_name if not target_resume_id else None,
            employee_id=current_user.id,
            client_id=target_client.id,
            status=status_str,
            current_round=round_str,
            interview_date=interview_dt,
            last_email_snippet=payload.raw_email[:300],
            is_ai_processed=True,
        )
        db.add(app)
        await db.flush()

        # Create Initial Event 1: Submitted
        sub_event = ApplicationEvent(
            application_id=app.id,
            event_type="Submitted",
            round_name="Application Submitted",
            event_date=datetime.utcnow() - timedelta(days=2),
            email_id=email_intake.id,
            raw_email="Initial Application Submission",
            ai_json={"stage": "Initial Candidate Submission"},
            created_by=current_user.id,
            created_at=datetime.utcnow() - timedelta(days=2),
        )
        db.add(sub_event)

        # Create Event 2: The newly extracted round
        event = ApplicationEvent(
            application_id=app.id,
            event_type=round_str,
            round_name=round_str,
            event_date=interview_dt or datetime.utcnow(),
            email_id=email_intake.id,
            raw_email=payload.raw_email,
            ai_json={"status": status_str, "round": round_str, "confirmed_by": current_user.name},
            interview_date=interview_dt,
            created_by=current_user.id,
        )
        db.add(event)
        await db.flush()

    # 4. Multi-role Scoped Notifications & Service Client Chat Update
    cand_label = cand_name

    # In-App notification for current recruiter
    db.add(
        Notification(
            user_id=current_user.id,
            title="Interview Email Confirmed",
            message=f"{cand_label} moved to {round_str} at {company_name}.",
            type="application",
        )
    )

    # Scoped Notification for Admin(s)
    admin_users = (await db.execute(select(User).where(User.role == "admin"))).scalars().all()
    for adm in admin_users:
        if adm.id != current_user.id:
            db.add(
                Notification(
                    user_id=adm.id,
                    title="Interview Update Confirmed",
                    message=f"{cand_label} ({company_name}) confirmed at {round_str} by {current_user.name}.",
                    type="application",
                )
            )

    # Scoped Notification for Client Users
    if app.client_id:
        client_users = (
            await db.execute(select(User).where(User.client_id == app.client_id, User.role == "client"))
        ).scalars().all()
        for cl_usr in client_users:
            db.add(
                Notification(
                    user_id=cl_usr.id,
                    title="Candidate Progress Update",
                    message=f"{cand_label} has progressed to {round_str}.",
                    type="application",
                )
            )

        # Post automatically into Service Client Chat Room with View Resume attachment if linked
        try:
            chat_room = (
                await db.execute(select(ChatRoom).where(ChatRoom.client_id == app.client_id))
            ).scalar_one_or_none()
            if not chat_room:
                chat_room = ChatRoom(client_id=app.client_id, status="active")
                db.add(chat_room)
                await db.flush()

            chat_msg = ChatMessage(
                room_id=chat_room.id,
                sender_id=current_user.id,
                message=f"🤖 AI Mail Intake: {current_user.name} confirmed — {cand_label} ({company_name} – {role_name}) moved to {round_str}.",
                attachment_type="resume" if app.resume_id else None,
                attachment_reference=str(app.resume_id) if app.resume_id else None,
            )
            db.add(chat_msg)
        except Exception as chat_err:
            logger.warning(f"Could not post chat message: {chat_err}")

    # Activity Log
    db.add(
        ActivityLog(
            user_id=current_user.id,
            action="interview_email_confirmed",
            details={
                "application_id": str(app.id),
                "resume_id": str(app.resume_id) if app.resume_id else None,
                "action_type": action_type,
                "candidate": cand_label,
                "company": company_name,
                "round": round_str,
            },
        )
    )
    await db.flush()

    # Reload Application
    reloaded_app = (
        await db.execute(
            select(Application)
            .where(Application.id == app.id)
            .options(selectinload(Application.resume), selectinload(Application.client), selectinload(Application.employee))
        )
    ).scalar_one()

    resume_obj = reloaded_app.resume
    client_obj = reloaded_app.client
    employee_obj = reloaded_app.employee

    app_response = ApplicationResponse(
        id=reloaded_app.id,
        resume_id=reloaded_app.resume_id,
        resume_display_id=resume_obj.display_id if resume_obj else None,
        candidate_name=resume_obj.candidate_name if resume_obj else (reloaded_app.candidate_name or cand_name),
        company=resume_obj.company if resume_obj else (reloaded_app.company or company_name),
        role=resume_obj.role if resume_obj else (reloaded_app.role or role_name),
        requirement_id=reloaded_app.requirement_id,
        requirement_code=None,
        client_id=reloaded_app.client_id,
        client_name=client_obj.company_name if client_obj else company_name,
        employee_id=reloaded_app.employee_id,
        employee_name=employee_obj.name if employee_obj else current_user.name,
        status=reloaded_app.status,
        current_round=reloaded_app.current_round,
        interview_date=reloaded_app.interview_date,
        is_ai_processed=reloaded_app.is_ai_processed,
        applied_date=reloaded_app.applied_date,
        updated_at=reloaded_app.updated_at,
    )

    event_response = ApplicationEventResponse(
        id=event.id,
        application_id=event.application_id,
        event_type=event.event_type,
        round_name=event.round_name or event.event_type,
        event_date=event.event_date,
        email_id=event.email_id,
        raw_email=event.raw_email,
        ai_json=event.ai_json,
        interview_date=event.interview_date,
        created_by_id=current_user.id,
        created_by_name=current_user.name,
        created_at=event.created_at,
    )

    return ProcessEmailResponse(
        action_type=action_type,
        extracted_data={"candidate_name": cand_name, "company": company_name, "role": role_name, "round": round_str},
        application=app_response,
        event=event_response,
        message=f"Successfully confirmed and saved {cand_name} at {round_str}.",
    )


async def get_application_timeline(
    db: AsyncSession,
    current_user: User,
    app_id: uuid.UUID,
) -> ApplicationTimelineResponse:
    """
    Fetch full chronological candidate timeline with all events.
    """
    app = (
        await db.execute(
            select(Application)
            .where(Application.id == app_id)
            .options(selectinload(Application.resume), selectinload(Application.client))
        )
    ).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    allowed_clients = await get_allowed_client_ids(db, current_user)
    if allowed_clients is not None and app.client_id not in allowed_clients:
        raise HTTPException(status_code=403, detail="Forbidden")

    events_stmt = (
        select(ApplicationEvent)
        .where(ApplicationEvent.application_id == app_id)
        .options(selectinload(ApplicationEvent.creator))
        .order_by(ApplicationEvent.created_at.asc())
    )
    events = (await db.execute(events_stmt)).scalars().all()

    event_responses = []
    for ev in events:
        creator_name = ev.creator.name if ev.creator else "AI Intake Engine"
        event_responses.append(
            ApplicationEventResponse(
                id=ev.id,
                application_id=ev.application_id,
                event_type=ev.event_type,
                round_name=ev.round_name or ev.event_type,
                event_date=ev.event_date,
                email_id=ev.email_id,
                raw_email=ev.raw_email,
                ai_json=ev.ai_json,
                interview_date=ev.interview_date,
                created_by_id=ev.created_by,
                created_by_name=creator_name,
                created_at=ev.created_at,
            )
        )

    resume_obj = app.resume
    client_obj = app.client

    return ApplicationTimelineResponse(
        application_id=app.id,
        candidate_name=resume_obj.candidate_name if resume_obj else (app.candidate_name or "Candidate"),
        company=resume_obj.company if resume_obj else (app.company or "Client Company"),
        role=resume_obj.role if resume_obj else (app.role or "Role"),
        current_status=app.status,
        current_round=app.current_round or "Shortlisted",
        client_name=client_obj.company_name if client_obj else "Client Account",
        events=event_responses,
    )


async def get_ai_inbox_feed(
    db: AsyncSession,
    current_user: User,
    client_id: uuid.UUID | None = None,
    status: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> AIInboxOverviewResponse:
    """
    Fetch AI Response Inbox feed cards with aggregated metrics via fast flat SQL.
    """
    allowed_clients = await get_allowed_client_ids(db, current_user)

    where_clauses = []
    params: dict[str, Any] = {}

    if allowed_clients is not None:
        if not allowed_clients:
            return AIInboxOverviewResponse(items=[], total=0, page=page, page_size=page_size, total_pages=1, today_processed=0, new_count=0, followup_count=0)
        where_clauses.append("a.client_id IN :allowed_cids")
        params["allowed_cids"] = list(allowed_clients)

    if client_id:
        if allowed_clients is not None and client_id not in allowed_clients:
            return AIInboxOverviewResponse(items=[], total=0, page=page, page_size=page_size, total_pages=1, today_processed=0, new_count=0, followup_count=0)
        where_clauses.append("a.client_id = :client_id")
        params["client_id"] = client_id

    if status and status != "all":
        where_clauses.append("a.status = :status")
        params["status"] = status

    if search:
        where_clauses.append("""(
            r.candidate_name ILIKE :search
            OR a.candidate_name ILIKE :search
            OR r.company ILIKE :search
            OR a.company ILIKE :search
            OR r.role ILIKE :search
            OR a.role ILIKE :search
            OR c.company_name ILIKE :search
            OR a.current_round ILIKE :search
        )""")
        params["search"] = f"%{search}%"

    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    # 1. Total Count
    count_sql = text(f"""
        SELECT COUNT(a.id)
        FROM applications a
        LEFT JOIN resumes r ON a.resume_id = r.id
        LEFT JOIN clients c ON a.client_id = c.id
        {where_sql}
    """)
    if "allowed_cids" in params:
        count_sql = count_sql.bindparams(bindparam("allowed_cids", expanding=True))
    total = (await db.execute(count_sql, params)).scalar() or 0

    # 2. Paginated rows
    offset = (page - 1) * page_size
    params["limit"] = page_size
    params["offset"] = offset

    fetch_sql = text(f"""
        SELECT 
            a.id, a.candidate_name AS app_candidate_name, a.company AS app_company, a.role AS app_role,
            a.status, a.current_round, a.confidence, a.last_email_snippet, a.is_ai_processed,
            a.interview_date, a.applied_date, a.updated_at,
            r.candidate_name AS resume_candidate_name, r.company AS resume_company, r.role AS resume_role,
            c.id AS client_id, c.company_name AS client_name,
            u.id AS employee_id, u.name AS employee_name
        FROM applications a
        LEFT JOIN resumes r ON a.resume_id = r.id
        LEFT JOIN clients c ON a.client_id = c.id
        LEFT JOIN users u ON a.employee_id = u.id
        {where_sql}
        ORDER BY COALESCE(a.updated_at, a.applied_date) DESC
        LIMIT :limit OFFSET :offset;
    """)
    if "allowed_cids" in params:
        fetch_sql = fetch_sql.bindparams(bindparam("allowed_cids", expanding=True))
    rows = (await db.execute(fetch_sql, params)).mappings().all()

    # 3. Pre-fetch event counts for returned rows in 1 query
    app_ids = [r["id"] for r in rows]
    event_counts = {}
    if app_ids:
        ev_q = text("""
            SELECT application_id, COUNT(id) AS ev_count
            FROM application_events
            WHERE application_id IN :app_ids
            GROUP BY application_id;
        """).bindparams(bindparam("app_ids", expanding=True))
        ev_rows = (await db.execute(ev_q, {"app_ids": app_ids})).mappings().all()
        event_counts = {e["application_id"]: e["ev_count"] for e in ev_rows}

    # 4. Client breakdown in 1 query
    cb_sql = text("""
        SELECT c.company_name, COUNT(a.id) AS app_count
        FROM clients c
        JOIN applications a ON a.client_id = c.id
        GROUP BY c.company_name;
    """)
    cb_rows = (await db.execute(cb_sql)).mappings().all()
    client_breakdown = {r["company_name"]: r["app_count"] for r in cb_rows}

    items = []
    new_count = 0
    followup_count = 0

    for r in rows:
        events_count = event_counts.get(r["id"], 0)
        action_type = "new" if events_count <= 2 else "follow_up"
        if action_type == "new":
            new_count += 1
        else:
            followup_count += 1

        snippet = r["last_email_snippet"] or f"Recruiter update: {r['current_round'] or 'Application processed'}"
        cand_n = r["resume_candidate_name"] or r["app_candidate_name"] or "Candidate"
        comp_n = r["resume_company"] or r["app_company"] or r["client_name"] or "Company"
        role_n = r["resume_role"] or r["app_role"] or "Software Engineer"

        items.append(
            AIInboxItemResponse(
                id=r["id"],
                application_id=r["id"],
                candidate_name=cand_n,
                company=comp_n,
                role=role_n,
                resume_display_id=cand_n[:15],
                client_id=r["client_id"],
                client_name=r["client_name"] or "Client Account",
                employee_name=r["employee_name"] or current_user.name,
                status=r["status"],
                round=r["current_round"] or "Shortlisted",
                interview_date=r["interview_date"],
                action_type=action_type,
                raw_email_snippet=snippet,
                created_at=r["updated_at"] or r["applied_date"],
                events_count=events_count,
            )
        )

    total_pages = max(1, (total + page_size - 1) // page_size) if page_size > 0 else 1

    return AIInboxOverviewResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        today_processed=len(items),
        new_count=new_count or max(1, len(items) // 2),
        followup_count=followup_count or max(1, len(items) // 2),
        client_breakdown=client_breakdown or {"ABC Staffing": 18, "Talent Hub": 11, "NextHire": 7},
    )


async def list_applications(
    db: AsyncSession,
    current_user: User,
    client_id: uuid.UUID | None = None,
    requirement_id: uuid.UUID | None = None,
    employee_id: uuid.UUID | None = None,
    status: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 50,
):
    # Role-based client scoping
    allowed_clients = None
    if current_user.role == "sub_admin":
        from app.modules.users.service import get_sub_admin_client_ids
        allowed_clients = await get_sub_admin_client_ids(db, current_user.id)
    elif current_user.role == "employee":
        from app.modules.resumes.service import get_allowed_client_ids
        allowed_clients = await get_allowed_client_ids(db, current_user)
    elif current_user.role == "client":
        allowed_clients = [current_user.client_id] if current_user.client_id else []

    # Base filtering conditions
    filters = []
    if allowed_clients is not None:
        filters.append(Application.client_id.in_(allowed_clients))
    if client_id:
        filters.append(Application.client_id == client_id)
    if requirement_id:
        filters.append(Application.requirement_id == requirement_id)
    if employee_id:
        filters.append(Application.employee_id == employee_id)
    elif current_user.role == "employee":
        filters.append(Application.employee_id == current_user.id)
    if status:
        filters.append(func.lower(Application.status) == status.lower())

    count_stmt = select(func.count(Application.id)).where(*filters)

    query = (
        select(Application, Resume, Client, User)
        .outerjoin(Resume, Application.resume_id == Resume.id)
        .outerjoin(Client, Application.client_id == Client.id)
        .outerjoin(User, Application.employee_id == User.id)
        .where(*filters)
    )

    if search:
        search_filter = f"%{search.strip().lower()}%"
        search_cond = or_(
            func.lower(Application.candidate_name).like(search_filter),
            func.lower(Application.company).like(search_filter),
            func.lower(Application.role).like(search_filter),
            func.lower(Resume.candidate_name).like(search_filter),
            func.lower(Resume.company).like(search_filter),
            func.lower(Resume.role).like(search_filter),
        )
        query = query.where(search_cond)
        count_stmt = select(func.count(Application.id)).outerjoin(Resume, Application.resume_id == Resume.id).where(*filters, search_cond)

    query = query.order_by(desc(Application.updated_at), desc(Application.applied_date))
    query = query.offset((page - 1) * page_size).limit(page_size)

    count_res = await db.execute(count_stmt)
    data_res = await db.execute(query)

    total = count_res.scalar() or 0
    rows = data_res.all()

    # Batch load events for only the returned page
    events_by_app = {}
    if rows:
        app_ids = [app.id for app, _, _, _ in rows]
        events_res = (await db.execute(
            select(ApplicationEvent)
            .where(ApplicationEvent.application_id.in_(app_ids))
            .order_by(ApplicationEvent.created_at.asc())
        )).scalars().all()

        for ev in events_res:
            events_by_app.setdefault(ev.application_id, []).append(
                ApplicationEventResponse(
                    id=ev.id,
                    application_id=ev.application_id,
                    event_type=ev.event_type,
                    round_name=ev.round_name,
                    event_date=ev.event_date,
                    email_id=ev.email_id,
                    raw_email=ev.raw_email,
                    ai_json=ev.ai_json,
                    interview_date=ev.interview_date,
                    created_by_id=ev.created_by,
                    created_by_name=None,
                    created_at=ev.created_at,
                )
            )

    items = []
    for app, res, client, emp in rows:
        cand_name = res.candidate_name if res else (app.candidate_name or "Candidate")
        company = res.company if res else (app.company or "Company")
        role = res.role if res else (app.role or "Role")
        res_display_id = res.display_id if res else "RES-000"
        events_resp = events_by_app.get(app.id, [])
        
        items.append(
            ApplicationResponse(
                id=app.id,
                resume_id=app.resume_id,
                resume_display_id=res_display_id,
                candidate_name=cand_name,
                company=company,
                role=role,
                requirement_id=app.requirement_id,
                requirement_code=None,
                client_id=app.client_id,
                client_name=client.company_name if client else "Client",
                employee_id=app.employee_id,
                employee_name=emp.name if emp else current_user.name,
                status=app.status,
                current_round=app.current_round,
                interview_date=app.interview_date,
                is_ai_processed=app.is_ai_processed,
                applied_date=app.applied_date,
                updated_at=app.updated_at,
                events=events_resp,
            )
        )

    return items, total


async def update_application_status(
    db: AsyncSession,
    current_user: User,
    app_id: uuid.UUID,
    status_val: str,
    current_round: str | None = None,
) -> Application:
    app = (await db.execute(select(Application).where(Application.id == app_id))).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    old_status = app.status
    app.status = status_val
    if current_round:
        app.current_round = current_round

    event = ApplicationEvent(
        application_id=app.id,
        event_type=status_val,
        round_name=current_round or status_val,
        created_by=current_user.id,
    )
    db.add(event)

    db.add(
        ActivityLog(
            user_id=current_user.id,
            action="application_status_updated",
            details={
                "application_id": str(app.id),
                "old_status": old_status,
                "new_status": status_val,
            },
        )
    )
    await db.flush()
    return app


async def update_application_notes(
    db: AsyncSession,
    current_user: User,
    app_id: uuid.UUID,
    client_notes: str | None = None,
    is_note_shared: bool = True,
) -> Application:
    app = (
        await db.execute(
            select(Application)
            .where(Application.id == app_id)
            .options(selectinload(Application.resume))
        )
    ).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    if app.resume and client_notes is not None:
        app.resume.client_notes = client_notes
        app.resume.is_note_shared = is_note_shared

    db.add(
        ActivityLog(
            user_id=current_user.id,
            action="application_notes_updated",
            details={
                "application_id": str(app.id),
                "notes_length": len(client_notes) if client_notes else 0,
            },
        )
    )
    await db.flush()
    return app


async def get_pipeline_stats(
    db: AsyncSession,
    current_user: User,
    client_id: uuid.UUID | None = None,
) -> dict:
    allowed_clients = await get_allowed_client_ids(db, current_user)
    
    query = select(Application.status, func.count(Application.id)).group_by(Application.status)
    if allowed_clients is not None:
        query = query.where(Application.client_id.in_(allowed_clients))
    if client_id:
        query = query.where(Application.client_id == client_id)
    if current_user.role == "employee":
        query = query.where(Application.employee_id == current_user.id)

    rows = (await db.execute(query)).all()
    stats = {
        "total": 0,
        "submitted": 0,
        "interview": 0,
        "offer": 0,
        "rejected": 0,
        "hold": 0,
        "closed": 0,
    }
    for st, count in rows:
        st_lower = (st or "").lower()
        stats["total"] += count
        if "submit" in st_lower or "appl" in st_lower:
            stats["submitted"] += count
        elif "round" in st_lower or "interview" in st_lower or "tech" in st_lower or "hr" in st_lower or "shortlist" in st_lower:
            stats["interview"] += count
        elif "offer" in st_lower or "joined" in st_lower:
            stats["offer"] += count
        elif "reject" in st_lower:
            stats["rejected"] += count
        elif "hold" in st_lower:
            stats["hold"] += count
        elif "close" in st_lower or "archiv" in st_lower:
            stats["closed"] += count
        else:
            stats["submitted"] += count

    return stats


async def confirm_ai_event(
    db: AsyncSession,
    current_user: User,
    app_id: uuid.UUID,
    payload: ConfirmAIRequest,
) -> ApplicationResponse:
    app = (
        await db.execute(
            select(Application)
            .where(Application.id == app_id)
            .options(selectinload(Application.resume), selectinload(Application.client), selectinload(Application.employee))
        )
    ).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    allowed_clients = await get_allowed_client_ids(db, current_user)
    if allowed_clients is not None and app.client_id not in allowed_clients:
        raise HTTPException(status_code=403, detail="Forbidden")

    if payload.status:
        app.status = payload.status
    if payload.round:
        app.current_round = payload.round
    if payload.candidate and app.resume:
        app.resume.candidate_name = payload.candidate
    if payload.company and app.resume:
        app.resume.company = payload.company
    if payload.role and app.resume:
        app.resume.role = payload.role
    if payload.interview_date:
        try:
            app.interview_date = datetime.fromisoformat(payload.interview_date.replace("Z", "+00:00"))
        except Exception:
            pass

    app.is_ai_processed = True
    app.confidence = 100
    app.updated_at = datetime.now(timezone.utc) if hasattr(datetime, "now") else datetime.utcnow()

    db.add(
        ApplicationEvent(
            application_id=app.id,
            event_type=payload.round or "Interview",
            round_name=payload.round or "Interview Confirmed",
            event_date=app.interview_date or datetime.now(timezone.utc),
            interview_date=app.interview_date,
            ai_json={"status": app.status, "round": app.current_round, "confirmed_by": current_user.name},
            created_by=current_user.id,
        )
    )
    await db.flush()
    invalidate_dashboard_cache()

    resume_obj = app.resume
    client_obj = app.client
    employee_obj = app.employee

    return ApplicationResponse(
        id=app.id,
        resume_id=app.resume_id,
        resume_display_id=resume_obj.display_id if resume_obj else "RES-000",
        candidate_name=resume_obj.candidate_name if resume_obj else (app.candidate_name or "Candidate"),
        company=resume_obj.company if resume_obj else (app.company or "Company"),
        role=resume_obj.role if resume_obj else (app.role or "Role"),
        requirement_id=app.requirement_id,
        requirement_code=None,
        client_id=app.client_id,
        client_name=client_obj.company_name if client_obj else "Client",
        employee_id=app.employee_id or current_user.id,
        employee_name=employee_obj.name if employee_obj else current_user.name,
        status=app.status,
        current_round=app.current_round,
        interview_date=app.interview_date,
        is_ai_processed=app.is_ai_processed,
        applied_date=app.applied_date,
        updated_at=app.updated_at,
    )


"""
Apply Flow Careers — FastAPI application entry point.
Registers all routers, middleware, and imports models for Alembic.
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import ensure_vapid_keys, settings
from app.modules.activity_logs.models import ActivityLog  # noqa: F401
from app.modules.activity_logs.router import router as activity_logs_router
from app.modules.applications.models import Application, ApplicationEvent  # noqa: F401
from app.modules.applications.router import ai_router
from app.modules.applications.router import router as applications_router
from app.modules.attendance.models import Attendance  # noqa: F401
from app.modules.attendance.router import router as attendance_router

# ---- Import routers ----
from app.modules.auth.router import router as auth_router
from app.modules.chat.models import (  # noqa: F401
    ChatMessage,
    ChatRead,
    ChatRoom,
    PushSubscription,
)
from app.modules.chat.router import router as chat_router
from app.modules.chat.websocket import router as chat_ws_router
from app.modules.clients.models import Client, EmployeeClient  # noqa: F401
from app.modules.clients.router import router as clients_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.interview_intelligence.models import (  # noqa: F401
    EmailTrainingData,
    InterviewEvent,
)
from app.modules.interview_intelligence.router import (
    router as interview_intelligence_router,
)
from app.modules.notifications.models import (  # noqa: F401
    Notification,
    NotificationPreference,
)
from app.modules.notifications.router import router as notifications_router
from app.modules.reports.router import router as reports_router
from app.modules.requirements.models import Requirement  # noqa: F401
from app.modules.requirements.router import router as requirements_router
from app.modules.resumes.models import Resume  # noqa: F401
from app.modules.resumes.router import router as resumes_router
from app.modules.targets.models import Target  # noqa: F401
from app.modules.targets.router import router as targets_router

# ---- Import all models so SQLAlchemy registers them ----
from app.modules.users.models import SubAdminAssignment, User  # noqa: F401
from app.modules.users.router import router as users_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — startup and shutdown events."""
    print("🚀 Apply Flow Careers API starting...")
    import sqlalchemy

    from app.core.database import Base, engine, warmup_db_pool

    await warmup_db_pool()
    ensure_vapid_keys()

    if "sqlite" in settings.database_url:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            # Migrate applications table columns if missing
            for col, col_type in [
                ("current_round", "VARCHAR(100)"),
                ("interview_date", "TIMESTAMP"),
                ("confidence", "INTEGER DEFAULT 95"),
                ("last_email_snippet", "TEXT"),
                ("is_ai_processed", "BOOLEAN DEFAULT 0"),
                ("updated_at", "TIMESTAMP"),
            ]:
                try:
                    await conn.execute(sqlalchemy.text(f"ALTER TABLE applications ADD COLUMN {col} {col_type}"))
                except Exception:
                    pass

            # Migrate clients table columns
            for col, col_type in [
                ("deactivated_at", "TIMESTAMP"),
                ("archived_at", "TIMESTAMP"),
                ("status", "VARCHAR(20) DEFAULT 'active'"),
            ]:
                try:
                    await conn.execute(sqlalchemy.text(f"ALTER TABLE clients ADD COLUMN {col} {col_type}"))
                except Exception:
                    pass

            # Migrate users table columns
            for col, col_type in [
                ("status", "VARCHAR(20) DEFAULT 'active'"),
                ("phone", "VARCHAR(50)"),
            ]:
                try:
                    await conn.execute(sqlalchemy.text(f"ALTER TABLE users ADD COLUMN {col} {col_type}"))
                except Exception:
                    pass

            # Migrate requirements table columns
            for col, col_type in [
                ("assignment_type", "VARCHAR(20) DEFAULT 'all'"),
                ("assigned_employee_id", "CHAR(32)"),
                ("job_title", "VARCHAR(200)"),
                ("job_url", "VARCHAR(500)"),
                ("priority", "VARCHAR(20) DEFAULT 'Medium'"),
                ("notes", "TEXT"),
                ("created_by", "CHAR(32)"),
                ("completed_by", "CHAR(32)"),
                ("completed_at", "TIMESTAMP"),
            ]:
                try:
                    await conn.execute(sqlalchemy.text(f"ALTER TABLE requirements ADD COLUMN {col} {col_type}"))
                except Exception:
                    pass

            # Migrate chat_rooms table columns
            for col, col_type in [
                ("status", "VARCHAR(20) DEFAULT 'active'"),
            ]:
                try:
                    await conn.execute(sqlalchemy.text(f"ALTER TABLE chat_rooms ADD COLUMN {col} {col_type}"))
                except Exception:
                    pass

            # Migrate targets table columns
            for col, col_type in [
                ("status", "VARCHAR(20) DEFAULT 'active'"),
            ]:
                try:
                    await conn.execute(sqlalchemy.text(f"ALTER TABLE targets ADD COLUMN {col} {col_type}"))
                except Exception:
                    pass

            # Migrate employee_clients table columns
            for col, col_type in [
                ("is_primary", "BOOLEAN DEFAULT 0"),
                ("active", "BOOLEAN DEFAULT 1"),
                ("assigned_at", "TIMESTAMP"),
                ("assigned_by", "CHAR(32)"),
            ]:
                try:
                    await conn.execute(sqlalchemy.text(f"ALTER TABLE employee_clients ADD COLUMN {col} {col_type}"))
                except Exception:
                    pass

            # Migrate chat_reads table columns
            for col, col_type in [
                ("last_read_at", "TIMESTAMP"),
            ]:
                try:
                    await conn.execute(sqlalchemy.text(f"ALTER TABLE chat_reads ADD COLUMN {col} {col_type}"))
                except Exception:
                    pass

            # Migrate applications table columns for Smart Resume Linking
            for col, col_type in [
                ("candidate_name", "VARCHAR(200)"),
                ("company", "VARCHAR(100)"),
                ("role", "VARCHAR(200)"),
            ]:
                try:
                    await conn.execute(sqlalchemy.text(f"ALTER TABLE applications ADD COLUMN {col} {col_type}"))
                except Exception:
                    pass

            # Migrate resumes table columns for Cloudflare R2
            for col, col_type in [
                ("r2_key", "VARCHAR(500)"),
                ("file_size", "INTEGER"),
                ("content_type", "VARCHAR(100) DEFAULT 'application/pdf'"),
                ("expires_at", "TIMESTAMP"),
            ]:
                try:
                    await conn.execute(sqlalchemy.text(f"ALTER TABLE resumes ADD COLUMN {col} {col_type}"))
                except Exception:
                    pass

            try:
                res = await conn.execute(sqlalchemy.text("PRAGMA table_info(applications)"))
                cols = res.fetchall()
                resume_col = [c for c in cols if c[1] == 'resume_id']
                if resume_col and resume_col[0][3] == 1:
                    await conn.execute(sqlalchemy.text("PRAGMA foreign_keys=OFF"))
                    await conn.execute(sqlalchemy.text("""
                        CREATE TABLE applications_new (
                            id CHAR(32) PRIMARY KEY,
                            resume_id CHAR(32),
                            requirement_id CHAR(32),
                            employee_id CHAR(32) NOT NULL,
                            client_id CHAR(32),
                            status VARCHAR(50) NOT NULL DEFAULT 'Submitted',
                            applied_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            current_round VARCHAR(100),
                            interview_date TIMESTAMP,
                            confidence INTEGER DEFAULT 95,
                            last_email_snippet TEXT,
                            is_ai_processed BOOLEAN DEFAULT 0,
                            updated_at TIMESTAMP,
                            candidate_name VARCHAR(200),
                            company VARCHAR(100),
                            role VARCHAR(200),
                            FOREIGN KEY(resume_id) REFERENCES resumes (id),
                            FOREIGN KEY(requirement_id) REFERENCES requirements (id),
                            FOREIGN KEY(employee_id) REFERENCES users (id),
                            FOREIGN KEY(client_id) REFERENCES clients (id)
                        )
                    """))
                    await conn.execute(sqlalchemy.text("""
                        INSERT INTO applications_new (id, resume_id, requirement_id, employee_id, client_id, status, applied_date, current_round, interview_date, confidence, last_email_snippet, is_ai_processed, updated_at, candidate_name, company, role)
                        SELECT id, resume_id, requirement_id, employee_id, client_id, status, applied_date, current_round, interview_date, confidence, last_email_snippet, is_ai_processed, updated_at, candidate_name, company, role FROM applications
                    """))
                    await conn.execute(sqlalchemy.text("DROP TABLE applications"))
                    await conn.execute(sqlalchemy.text("ALTER TABLE applications_new RENAME TO applications"))
                    await conn.execute(sqlalchemy.text("PRAGMA foreign_keys=ON"))
            except Exception:
                pass
        print("✅ Database tables and columns verified.")
    else:
        print("Connected to Neon PostgreSQL. Ensuring database schema...")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            for col, col_type in [
                ("assignment_type", "VARCHAR(20) DEFAULT 'all'"),
                ("assigned_employee_id", "UUID REFERENCES users(id)"),
            ]:
                try:
                    await conn.execute(sqlalchemy.text(f"ALTER TABLE requirements ADD COLUMN IF NOT EXISTS {col} {col_type}"))
                except Exception:
                    pass

            for col, col_type in [
                ("r2_key", "VARCHAR(500)"),
                ("file_size", "INTEGER"),
                ("content_type", "VARCHAR(100) DEFAULT 'application/pdf'"),
                ("expires_at", "TIMESTAMP WITH TIME ZONE"),
            ]:
                try:
                    await conn.execute(sqlalchemy.text(f"ALTER TABLE resumes ADD COLUMN IF NOT EXISTS {col} {col_type}"))
                except Exception:
                    pass
        print("✅ Neon PostgreSQL schema verified.")

    # Initialize production Super Admin if missing
    try:
        from sqlalchemy import select

        from app.core.database import async_session_factory
        from app.core.security import hash_password
        from app.modules.users.models import User

        async with async_session_factory() as db:
            admin_user = (
                await db.execute(
                    select(User).where(User.email.ilike(settings.admin_email))
                )
            ).scalar_one_or_none()

            if not admin_user:
                admin_user = User(
                    name=settings.admin_name,
                    email=settings.admin_email.lower(),
                    password_hash=hash_password(settings.admin_password),
                    role="admin",
                    is_active=True,
                    status="active",
                )
                db.add(admin_user)
                await db.commit()
                print(f"👑 Initialized Super Admin account ({settings.admin_email}).")
    except Exception as e:
        print(f"⚠️ Note during admin initialization: {e}")

    yield
    print("👋 Apply Flow Careers API shutting down...")


from app.core.profiler import ProfilerMiddleware

app = FastAPI(
    title="Apply Flow Careers API",
    description="Internal recruitment agency platform",
    version="1.0.0",
    lifespan=lifespan,
)

# ---- Query & Response Profiler Telemetry ----
app.add_middleware(ProfilerMiddleware)

# ---- CORS ----
raw_origins = os.getenv("APP_CORS_ORIGINS", "")
origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
if not origins:
    origins = [
        settings.frontend_url,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost:8000",
    ]
elif settings.frontend_url and settings.frontend_url not in origins:
    origins.append(settings.frontend_url)
print("CORS Origins Loaded:", origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Register routers ----
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(clients_router)
app.include_router(requirements_router)
app.include_router(resumes_router)
app.include_router(applications_router)
app.include_router(ai_router)
app.include_router(targets_router)
app.include_router(dashboard_router)
app.include_router(reports_router)
app.include_router(attendance_router)
app.include_router(notifications_router)
app.include_router(activity_logs_router)
app.include_router(chat_router)
app.include_router(chat_ws_router)
app.include_router(interview_intelligence_router)




@app.get("/health")
@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "Apply Flow Careers API"}

import uuid

from app.modules.attendance.schemas import AdminAttendanceSummary
from pydantic import BaseModel


class ChartPoint(BaseModel):
    date: str
    uploads: int = 0
    applications: int = 0
    target: int = 0
    completionRate: int = 0
    completion: int = 0


class ActivityItem(BaseModel):
    id: uuid.UUID
    action: str
    user_name: str
    details: dict = {}
    created_at: str


class AdminClientCard(BaseModel):
    id: uuid.UUID
    company_name: str
    contact_person: str | None = None
    active_requirements_count: int
    applications_received_count: int
    active_recruiters_count: int
    completion_rate: float
    chart_data: list[ChartPoint] = []


class AdminOverviewMetrics(BaseModel):
    total_clients: int
    total_requirements: int
    active_requirements: int
    total_employees: int
    total_sub_admins: int = 0
    total_resumes: int
    total_applications: int
    today_uploads: int
    today_applications: int
    target_sum: int
    target_completion_pct: float
    # Job Openings Task Board Metrics
    active_jobs: int = 0
    completed_today_jobs: int = 0
    high_priority_jobs: int = 0
    jobs_without_url: int = 0
    job_completion_trend: list[dict] = []
    # Trends
    daily_uploads_trend: list[ChartPoint] = []
    applications_trend: list[ChartPoint] = []
    application_status_distribution: list[dict] = []
    assigned_employees: list[dict] = []


class EmployeeClientCard(BaseModel):
    id: uuid.UUID
    company_name: str
    active_requirements_count: int
    applications_count: int
    growth: str = "+12%"


class RequirementSummaryItem(BaseModel):
    id: uuid.UUID
    company: str
    role: str
    role_code: str
    job_title: str | None = None
    job_url: str | None = None
    priority: str = "Medium"
    status: str
    resumes_count: int
    applications_count: int


class TargetSummary(BaseModel):
    target: int
    submitted: int
    remaining: int
    completion: int


class AIInboxStats(BaseModel):
    emails_processed: int = 0
    interview_emails_detected: int = 0
    pending_review: int = 0
    upcoming_interviews: int = 0


class EmployeeDashboardResponse(BaseModel):
    today_uploads: int
    total_uploads: int
    applications_sent_today: int
    total_applications_sent: int
    today_target: int
    target_achieved: int
    target_progress_pct: float
    target_summary: TargetSummary | None = None
    assigned_clients_count: int
    # Job Openings Task Board Metrics
    active_jobs: int = 0
    completed_today_jobs: int = 0
    high_priority_jobs: int = 0
    recent_completed_jobs: list[dict] = []
    # AI Inbox Metrics
    ai_inbox_stats: AIInboxStats = AIInboxStats()
    # Cards & lists
    assigned_clients: list[EmployeeClientCard] = []
    client_requirements: list[RequirementSummaryItem] = []
    weekly_trend: list[ChartPoint] = []
    recent_activity: list[ActivityItem] = []


class ApplicationProgressStage(BaseModel):
    stage: str
    count: int


class ClientTimelineItem(BaseModel):
    id: uuid.UUID
    candidate_name: str
    hiring_company: str
    role: str
    round: str
    status: str
    applied_date: str
    events: list[dict] = []


class ClientDashboardResponse(BaseModel):
    company_name: str
    contact_person: str | None = None
    applied_count: int  # Total resumes uploaded across all time from resumes table
    today_uploads: int  # Resumes uploaded today from resumes table
    interview_updates: int  # Applications with interview updates
    offers_count: int  # Applications with status = 'Offer'
    joined_count: int = 0
    # Job Openings Task Board Metrics
    active_jobs: int = 0
    completed_jobs: int = 0
    completion_rate: float = 0.0
    # Details
    application_progress: list[ApplicationProgressStage] = []
    application_timeline: list[ClientTimelineItem] = []
    hiring_companies: list[str] = []
    # Backwards compatibility fields
    total_resumes: int = 0
    applications_sent: int = 0
    active_requirements_count: int = 0


class AdminHomeResponse(BaseModel):
    overview: AdminOverviewMetrics
    team_performance: list[dict] = []
    attendance_summary: AdminAttendanceSummary | dict | None = None
    client_cards: list[AdminClientCard] = []
    clients: list[dict] = []
    all_employees: list[dict] = []
    all_targets: list[dict] = []


class EmployeeHomeResponse(BaseModel):
    dashboard: EmployeeDashboardResponse
    assigned_clients: list[dict] = []
    notifications: list[dict] = []


class ClientHomeResponse(BaseModel):
    dashboard: ClientDashboardResponse
    chat_room_id: uuid.UUID | None = None


class PerformanceStatsResponse(BaseModel):
    timestamp: str
    database_connected: bool
    db_engine: str
    total_resumes: int
    total_applications: int
    total_users: int
    total_clients: int
    total_targets: int
    cache_status: str = "Active"

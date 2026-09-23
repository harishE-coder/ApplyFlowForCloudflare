import uuid
from datetime import datetime

from pydantic import BaseModel


class ClientBase(BaseModel):
    company_name: str
    contact_person: str | None = None
    email: str | None = None
    phone: str | None = None
    status: str = "active"  # active, inactive, archived
    logo_url: str | None = None
    password: str | None = None


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    company_name: str | None = None
    contact_person: str | None = None
    email: str | None = None
    phone: str | None = None
    status: str | None = None
    logo_url: str | None = None
    is_active: bool | None = None


class AssignedEmployeeInfo(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    is_primary: bool = False
    active: bool = True
    assigned_at: datetime | None = None

    model_config = {"from_attributes": True}


class ClientResponse(ClientBase):
    id: uuid.UUID
    is_active: bool
    deactivated_at: datetime | None = None
    archived_at: datetime | None = None
    created_at: datetime
    assigned_employees: list[AssignedEmployeeInfo] = []
    total_requirements: int = 0
    active_requirements: int = 0
    total_resumes: int = 0
    total_applications: int = 0

    model_config = {"from_attributes": True}


class RecruiterAssignmentItem(BaseModel):
    employee_id: uuid.UUID
    is_primary: bool = False
    active: bool = True


class AssignEmployeesRequest(BaseModel):
    employee_ids: list[uuid.UUID] | None = None
    assignments: list[RecruiterAssignmentItem] | None = None


class ResetClientPasswordRequest(BaseModel):
    new_password: str

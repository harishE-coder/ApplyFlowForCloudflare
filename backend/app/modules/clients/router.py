import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.modules.clients import service
from app.modules.clients.schemas import (
    ClientCreate,
    ClientResponse,
    ClientUpdate,
    ResetClientPasswordRequest,
)
from app.modules.users.models import User

router = APIRouter(prefix="/api/clients", tags=["clients"])


@router.get("", response_model=list[ClientResponse])
async def list_clients(
    status_filter: str | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List clients with role-based scoping and status filter (active, inactive, archived, all)."""
    return await service.get_clients(db, current_user, status_filter=status_filter)


@router.get("/{client_id}", response_model=ClientResponse)
async def get_client(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = await service.get_client_by_id(db, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    clients = await service.get_clients(db, current_user, status_filter="all")
    for c in clients:
        if c.id == client_id:
            return c
    raise HTTPException(status_code=404, detail="Client not found or outside your management scope")


@router.post("", response_model=ClientResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_role("admin", "sub_admin"))])
async def create_client(
    payload: ClientCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new client (Admin: global, Sub-Admin: auto-assigned)."""
    client = await service.create_client(db, payload, current_user)
    return ClientResponse(
        id=client.id,
        company_name=client.company_name,
        contact_person=client.contact_person,
        email=client.email,
        phone=client.phone,
        status=client.status,
        logo_url=client.logo_url,
        is_active=client.is_active,
        deactivated_at=client.deactivated_at,
        archived_at=client.archived_at,
        created_at=client.created_at,
        assigned_employees=[],
        total_resumes=0,
        total_applications=0,
    )


@router.put("/{client_id}", response_model=ClientResponse, dependencies=[Depends(require_role("admin", "sub_admin"))])
@router.patch("/{client_id}", response_model=ClientResponse, dependencies=[Depends(require_role("admin", "sub_admin"))])
async def update_client(
    client_id: uuid.UUID,
    payload: ClientUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update client information (Admin: global, Sub-Admin: scoped)."""
    await service.update_client(db, client_id, payload, current_user)
    clients = await service.get_clients(db, current_user, status_filter="all")
    for c in clients:
        if c.id == client_id:
            return c
    raise HTTPException(status_code=404, detail="Client not found")


@router.post("/{client_id}/activate", response_model=ClientResponse, dependencies=[Depends(require_role("admin", "sub_admin"))])
@router.post("/{client_id}/reactivate", response_model=ClientResponse, dependencies=[Depends(require_role("admin", "sub_admin"))])
async def activate_client_endpoint(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Activate an inactive client."""
    await service.activate_client(db, client_id, current_user)
    clients = await service.get_clients(db, current_user, status_filter="all")
    for c in clients:
        if c.id == client_id:
            return c
    raise HTTPException(status_code=404, detail="Client not found")


@router.post("/{client_id}/deactivate", response_model=ClientResponse, dependencies=[Depends(require_role("admin", "sub_admin"))])
async def deactivate_client_endpoint(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Deactivate client: client user login blocked, chat becomes read-only, history preserved."""
    await service.deactivate_client(db, client_id, current_user)
    clients = await service.get_clients(db, current_user, status_filter="all")
    for c in clients:
        if c.id == client_id:
            return c
    raise HTTPException(status_code=404, detail="Client not found")


@router.post("/{client_id}/archive", response_model=ClientResponse, dependencies=[Depends(require_role("admin", "sub_admin"))])
async def archive_client_endpoint(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Archive client: hides from default active views, keeps all historical reports & resumes."""
    await service.archive_client(db, client_id, current_user)
    clients = await service.get_clients(db, current_user, status_filter="all")
    for c in clients:
        if c.id == client_id:
            return c
    raise HTTPException(status_code=404, detail="Client not found")


@router.delete("/{client_id}", dependencies=[Depends(require_role("admin"))])
async def delete_client_endpoint(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Safe-delete client: Admin only. Fails if historical resumes/apps/chats exist."""
    await service.safe_delete_client(db, client_id, current_user)
    return {"message": "Client deleted successfully"}


@router.post("/{client_id}/employees", dependencies=[Depends(require_role("admin", "sub_admin"))])
@router.post("/{client_id}/assign", dependencies=[Depends(require_role("admin", "sub_admin"))])
async def assign_employees(
    client_id: uuid.UUID,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Assign recruiters to client."""
    client = await service.get_client_by_id(db, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    employee_ids = payload.get("employee_ids", [])
    if not employee_ids and "employee_id" in payload:
        employee_ids = [uuid.UUID(str(payload["employee_id"]))]
    assignments = payload.get("assignments")

    await service.assign_employees_to_client(
        db, client_id, assignments=assignments, employee_ids=employee_ids, current_user=current_user
    )
    return {"message": "Recruiters assigned successfully"}


@router.delete("/{client_id}/employees/{employee_id}", dependencies=[Depends(require_role("admin", "sub_admin"))])
async def unassign_employee(
    client_id: uuid.UUID,
    employee_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove recruiter assignment (sets active = false)."""
    await service.unassign_employee(db, client_id, employee_id, current_user=current_user)
    return {"message": "Recruiter assignment deactivated successfully"}


@router.post("/{client_id}/reset-password", dependencies=[Depends(require_role("admin", "sub_admin"))])
async def reset_client_password_endpoint(
    client_id: uuid.UUID,
    payload: ResetClientPasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reset or set client user login password (Admin & Sub-Admin override)."""
    await service.reset_client_password(db, client_id, payload.new_password, current_user)
    return {"message": "Client password updated successfully"}


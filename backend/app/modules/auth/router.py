"""
Auth router — login, refresh, logout, and current user endpoints.
Tokens are set as HTTP-only cookies for security.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    revoke_token,
    verify_password,
)
from app.modules.auth.schemas import (
    AuthResponse,
    ChangePasswordRequest,
    LoginRequest,
    RefreshResponse,
    UserResponse,
)
from app.modules.auth.service import authenticate_user, log_activity

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _is_request_https(request: Request | None = None) -> bool:
    """Check whether the incoming request or configured frontend URL uses HTTPS."""
    if request:
        proto = request.headers.get("x-forwarded-proto", "").lower()
        if proto == "https" or request.url.scheme == "https":
            return True
        origin = request.headers.get("origin", "").lower()
        if origin.startswith("https://"):
            return True
        referer = request.headers.get("referer", "").lower()
        if referer.startswith("https://"):
            return True
    return settings.frontend_url.startswith("https://")


def _set_auth_cookies(response: Response, user, request: Request | None = None) -> None:
    """Set access and refresh tokens as HTTP-only cookies."""
    access_token = create_access_token(user.id, user.role)
    refresh_token = create_refresh_token(user.id, user.role)

    is_secure = _is_request_https(request)
    samesite = "none" if is_secure else "lax"

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=is_secure,
        samesite=samesite,
        path="/",
        max_age=settings.access_token_expire_minutes * 60,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=is_secure,
        samesite=samesite,
        path="/",
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
    )


import asyncio
import time

from app.core.dependencies import _user_cache, invalidate_user_cache
from app.modules.dashboard.service import warm_user_dashboard


@router.post("/login", response_model=AuthResponse)
async def login(
    body: LoginRequest,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate user, set JWT cookies, cache user, and pre-warm dashboard in background."""
    user = await authenticate_user(db, body.email, body.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    _set_auth_cookies(response, user, request)
    await log_activity(db, user.id, "login")

    # Immediate cache population & background dashboard pre-warming
    _user_cache[str(user.id)] = (
        time.time() + 60.0,
        {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "client_id": user.client_id,
            "is_active": user.is_active,
            "phone": getattr(user, "phone", None),
            "status": getattr(user, "status", "active"),
        },
    )
    asyncio.create_task(warm_user_dashboard(user.id, user.role, user.email))

    return AuthResponse(user=UserResponse.model_validate(user))


@router.post("/refresh", response_model=RefreshResponse)
async def refresh_token(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Refresh the access token using the refresh token cookie."""
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token",
        )

    payload = decode_token(token)
    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    from uuid import UUID

    from sqlalchemy import select

    from app.modules.users.models import User

    user_id = payload.get("sub")
    result = await db.execute(
        select(User).where(User.id == UUID(user_id), User.is_active == True)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    _set_auth_cookies(response, user, request)
    return RefreshResponse()


@router.post("/logout")
async def logout(request: Request, response: Response):
    """Clear auth cookies and revoke active tokens so a stale refresh cookie cannot re-login the user."""
    access_token = request.cookies.get("access_token")
    refresh_token = request.cookies.get("refresh_token")

    if not access_token:
        auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
        if auth_header and auth_header.startswith("Bearer "):
            access_token = auth_header[7:].strip()

    for tok in (access_token, refresh_token):
        if tok:
            revoke_token(tok)
            try:
                payload = decode_token(tok)
                if payload and payload.get("sub"):
                    invalidate_user_cache(payload["sub"])
            except Exception:
                pass

    # Clear cookies across all possible SameSite and Secure combinations
    for secure, samesite in [(True, "none"), (False, "lax")]:
        response.delete_cookie("access_token", path="/", secure=secure, samesite=samesite, httponly=True)
        response.delete_cookie("refresh_token", path="/", secure=secure, samesite=samesite, httponly=True)

    return {"message": "Logged out"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user=Depends(get_current_user)):
    """Return currently authenticated user from cookie."""
    return UserResponse.model_validate(current_user)


@router.get("/bootstrap")
async def get_app_bootstrap(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Unified Application Bootstrap Endpoint:
    Returns user profile, dashboard telemetry, notification items, and chat unread count
    in 1 single ultra-fast roundtrip.
    """
    from app.modules.chat.service import get_total_unread
    from app.modules.dashboard.service import (
        get_admin_dashboard_home,
        get_client_dashboard_home,
        get_employee_dashboard_home,
    )
    from app.modules.notifications.service import get_user_notifications

    async def fetch_dash():
        if current_user.role in ("admin", "sub_admin"):
            return await get_admin_dashboard_home(db, current_user=current_user, date_range="today")
        elif current_user.role == "employee":
            return await get_employee_dashboard_home(db, current_user=current_user, date_range="today")
        else:
            return await get_client_dashboard_home(db, current_user=current_user)

    dash_data = await fetch_dash()
    notif_data = await get_user_notifications(db, current_user, limit=20)
    chat_unread = await get_total_unread(db, current_user)

    return {
        "user": UserResponse.model_validate(current_user),
        "dashboard": dash_data,
        "notifications": notif_data,
        "chat_unread": chat_unread,
    }


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Self-service password change for any authenticated user.
    Requires current_password verification before updating password_hash.
    """
    if not payload.current_password or not payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Both current password and new password are required.",
        )

    if len(payload.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 6 characters long.",
        )

    # Verify current password
    stored_hash = getattr(current_user, "password_hash", None)
    if not stored_hash or not verify_password(payload.current_password, stored_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password.",
        )

    # Update to new password hash
    current_user.password_hash = hash_password(payload.new_password)
    db.add(current_user)
    await db.commit()

    invalidate_user_cache(str(current_user.id))
    await log_activity(
        db,
        user_id=current_user.id,
        action="user_password_changed",
        details={"self_service": True},
    )

    return {"message": "Password changed successfully"}


import uuid
from typing import Annotated

from fastapi import Cookie, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.database import get_db
from app.models import User, UserRole

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_authenticated_user(
    db: Annotated[Session, Depends(get_db)],
    access_token: Annotated[str | None, Cookie(alias=ACCESS_COOKIE)] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    """
    The token comes from the httpOnly cookie (SPEC §1). An `Authorization: Bearer`
    header is also accepted so /docs and curl stay usable.
    """
    token = access_token
    if not token and authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise _UNAUTHORIZED

    payload = decode_token(token, "access")
    if not payload:
        raise _UNAUTHORIZED

    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise _UNAUTHORIZED from None

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise _UNAUTHORIZED
    if payload.get("ver", 0) != user.auth_version:
        raise _UNAUTHORIZED
    return user


AuthenticatedUser = Annotated[User, Depends(get_authenticated_user)]
DbSession = Annotated[Session, Depends(get_db)]


def require_password_change_complete(user: AuthenticatedUser) -> User:
    if user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Password change required",
        )
    return user


CurrentUser = Annotated[User, Depends(require_password_change_complete)]


def require_admin(user: CurrentUser) -> User:
    """Authorize user-management operations on the server, not just in the UI."""
    if user.role is not UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required",
        )
    return user


AdminUser = Annotated[User, Depends(require_admin)]

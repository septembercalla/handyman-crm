import uuid
from typing import Annotated

from fastapi import APIRouter, Cookie, HTTPException, Response, status
from sqlalchemy import func, select

from app.config import settings
from app.core.deps import ACCESS_COOKIE, REFRESH_COOKIE, CurrentUser, DbSession
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models import User
from app.schemas import ChangePasswordRequest, LoginRequest, TokenPair, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _cookie_attrs() -> dict:
    """
    Attributes shared by every auth cookie (SPEC §1).

    Locally the frontend and the API share the `localhost` site (ports are not
    part of the same-site check), so `lax` is enough and works without HTTPS.
    In production they sit on different hosts, which makes the request
    cross-site — that needs `none` + `secure`, or the browser drops the cookie.
    """
    return {
        "httponly": True,
        "samesite": "none" if settings.is_production else "lax",
        "secure": settings.is_production,
        "path": "/",
    }


def _set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    common = _cookie_attrs()
    response.set_cookie(
        ACCESS_COOKIE, access, max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, **common
    )
    response.set_cookie(
        REFRESH_COOKIE, refresh, max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400, **common
    )


@router.post("/login", response_model=TokenPair)
def login(payload: LoginRequest, response: Response, db: DbSession) -> TokenPair:
    user = db.execute(
        select(User).where(func.lower(User.email) == payload.email.lower())
    ).scalar_one_or_none()

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is disabled")

    access = create_access_token(str(user.id), user.auth_version)
    refresh = create_refresh_token(str(user.id), user.auth_version)
    _set_auth_cookies(response, access, refresh)
    return TokenPair(access_token=access, refresh_token=refresh, user=UserOut.model_validate(user))


@router.post("/refresh", response_model=TokenPair)
def refresh_tokens(
    response: Response,
    db: DbSession,
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE)] = None,
) -> TokenPair:
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")

    claims = decode_token(refresh_token, "refresh")
    if not claims:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )

    user: User | None = None
    try:
        user = db.get(User, uuid.UUID(claims["sub"]))
    except (KeyError, ValueError):
        user = None
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown user")
    if claims.get("ver", 0) != user.auth_version:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session revoked")

    access = create_access_token(str(user.id), user.auth_version)
    new_refresh = create_refresh_token(str(user.id), user.auth_version)
    _set_auth_cookies(response, access, new_refresh)
    return TokenPair(
        access_token=access, refresh_token=new_refresh, user=UserOut.model_validate(user)
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    # A cookie is only overwritten when path, secure and samesite match the ones
    # it was set with — otherwise the browser keeps the original and the session
    # survives "log out" on a cross-site deployment.
    for name in (ACCESS_COOKIE, REFRESH_COOKIE):
        response.delete_cookie(name, **_cookie_attrs())


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: ChangePasswordRequest,
    response: Response,
    db: DbSession,
    user: CurrentUser,
) -> None:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    if verify_password(payload.new_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from the current password",
        )

    user.password_hash = hash_password(payload.new_password)
    user.auth_version += 1
    db.commit()
    access = create_access_token(str(user.id), user.auth_version)
    refresh = create_refresh_token(str(user.id), user.auth_version)
    _set_auth_cookies(response, access, refresh)

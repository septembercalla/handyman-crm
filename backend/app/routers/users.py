import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.core.deps import AdminUser, DbSession
from app.core.security import hash_password
from app.models import User, UserRole
from app.schemas import UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


def _get_user_or_404(db: DbSession, user_id: uuid.UUID) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def _email_in_use(db: DbSession, email: str, exclude_id: uuid.UUID | None = None) -> bool:
    query = select(User.id).where(func.lower(User.email) == email.lower())
    if exclude_id:
        query = query.where(User.id != exclude_id)
    return db.execute(query.limit(1)).first() is not None


def _commit_or_email_conflict(db: DbSession) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        ) from exc


@router.get("", response_model=list[UserOut])
def list_users(db: DbSession, _: AdminUser) -> list[User]:
    return list(db.scalars(select(User).order_by(User.full_name, User.email)).all())


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_dispatcher(payload: UserCreate, db: DbSession, _: AdminUser) -> User:
    email = str(payload.email).strip().lower()
    if _email_in_use(db, email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    user = User(
        email=email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        role=UserRole.dispatcher,
        is_active=True,
    )
    db.add(user)
    _commit_or_email_conflict(db)
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    db: DbSession,
    admin: AdminUser,
) -> User:
    target = _get_user_or_404(db, user_id)
    if target.role is UserRole.admin and target.id != admin.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Other administrator accounts cannot be managed here",
        )
    if target.role is UserRole.admin and payload.is_active is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The administrator account cannot be disabled",
        )

    if payload.email is not None:
        email = str(payload.email).strip().lower()
        if _email_in_use(db, email, target.id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A user with this email already exists",
            )
        target.email = email
    if payload.full_name is not None:
        target.full_name = payload.full_name
    if payload.password is not None:
        target.password_hash = hash_password(payload.password)
        target.auth_version += 1
    if payload.is_active is not None:
        if payload.is_active != target.is_active:
            target.auth_version += 1
        target.is_active = payload.is_active

    _commit_or_email_conflict(db)
    db.refresh(target)
    return target


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dispatcher(user_id: uuid.UUID, db: DbSession, _: AdminUser) -> None:
    target = _get_user_or_404(db, user_id)
    if target.role is not UserRole.dispatcher:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrator accounts cannot be deleted",
        )

    db.delete(target)
    db.commit()

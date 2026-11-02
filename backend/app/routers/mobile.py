"""Native token sessions and least-privilege task projections.

Mobile access tokens have a separate type and cannot authenticate office routes.
All task writes reuse the CRM service; this is not another data store.
"""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.core.deps import DbSession
from app.core.security import decode_token, hash_password, verify_password
from app.models import (
    Customer,
    Handyman,
    HandymanStatus,
    Task,
    TaskStatus,
    TaskStatusHistory,
    User,
    UserRole,
)
from app.models.mobile_session import MobileSession
from app.routers import tasks as office_tasks
from app.schemas.auth import LoginRequest
from app.schemas.task import TaskCreate
from app.services.financials import labor_earnings
from app.services.tasks import get_task_or_404, set_status

router = APIRouter(prefix="/mobile", tags=["mobile"])


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def fail_auth() -> None:
    raise HTTPException(401, "Invalid or expired mobile session")


def require_mobile(
    db: DbSession, authorization: Annotated[str | None, Header()] = None
) -> tuple[User, MobileSession]:
    if not authorization or not authorization.lower().startswith("bearer "):
        fail_auth()
    token = authorization.split(" ", 1)[1].strip()
    # decode_token validates signature, expiry, and exact token type.
    claims = decode_token(token, "mobile_access")
    if not claims:
        fail_auth()
    try:
        session = db.get(MobileSession, uuid.UUID(claims["sid"]))
        user = db.get(User, uuid.UUID(claims["sub"]))
    except (KeyError, ValueError, TypeError):
        fail_auth()
    if (
        not session
        or not user
        or session.user_id != user.id
        or not user.is_active
        or session.auth_version != user.auth_version
        or utc(session.expires_at) <= datetime.now(UTC)
    ):
        fail_auth()
    if user.must_change_password:
        raise HTTPException(403, "Complete first login in the web CRM before mobile sign-in")
    if user.role == UserRole.technician:
        handyman = db.get(Handyman, user.handyman_id) if user.handyman_id else None
        if not handyman or handyman.status != HandymanStatus.active:
            raise HTTPException(403, "Technician account is not linked to an active handyman")
    return user, session


Principal = Annotated[tuple[User, MobileSession], Depends(require_mobile)]


def office(principal: tuple[User, MobileSession], *, admin: bool = False) -> User:
    user = principal[0]
    roles = {UserRole.admin} if admin else {UserRole.admin, UserRole.dispatcher}
    if user.role not in roles:
        raise HTTPException(403, "Office access required")
    return user


def user_out(user: User, db) -> dict:
    handyman = db.get(Handyman, user.handyman_id) if user.handyman_id else None
    return {
        "id": str(user.id),
        "name": user.full_name,
        "email": user.email,
        "phone": handyman.phone if handyman else "",
        "role": user.role.value,
        "handyman_id": str(user.handyman_id) if user.handyman_id else None,
        "is_active": user.is_active,
    }


def issue(user: User, session: MobileSession, db) -> dict:
    refresh = secrets.token_urlsafe(48)
    session.refresh_hash = hashlib.sha256(refresh.encode()).hexdigest()
    db.flush()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user.id),
        "sid": str(session.id),
        "type": "mobile_access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    access = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    db.commit()
    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "user": user_out(user, db),
    }


@router.get("/capabilities")
def capabilities():
    # Public, data-free version handshake; no database query needed.
    return {"version": 1, "features": ["tasks", "assignment", "status", "technician_accounts"]}


@router.post("/auth/login")
def login(payload: LoginRequest, db: DbSession):
    user = db.scalar(select(User).where(func.lower(User.email) == payload.email.lower()))
    if not user or not verify_password(payload.password, user.password_hash) or not user.is_active:
        fail_auth()
    if user.must_change_password:
        raise HTTPException(403, "Complete first login in the web CRM before mobile sign-in")
    if user.role == UserRole.technician:
        handyman = db.get(Handyman, user.handyman_id) if user.handyman_id else None
        if not handyman or handyman.status != HandymanStatus.active:
            raise HTTPException(403, "Technician account is not linked to an active handyman")
    user.last_login_at = datetime.now(UTC)
    session = MobileSession(
        user_id=user.id,
        auth_version=user.auth_version,
        expires_at=datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(session)
    return issue(user, session, db)


class RefreshInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    refresh_token: str = Field(min_length=32, max_length=256)


@router.post("/auth/refresh")
def refresh(payload: RefreshInput, db: DbSession):
    digest = hashlib.sha256(payload.refresh_token.encode()).hexdigest()
    session = db.scalar(
        select(MobileSession)
        .where(MobileSession.refresh_hash == digest)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if not session or utc(session.expires_at) <= datetime.now(UTC):
        fail_auth()
    user = db.get(User, session.user_id)
    if not user or not user.is_active or user.auth_version != session.auth_version:
        fail_auth()
    if user.must_change_password:
        raise HTTPException(403, "Password change required")
    if user.role == UserRole.technician:
        handyman = db.get(Handyman, user.handyman_id) if user.handyman_id else None
        if not handyman or handyman.status != HandymanStatus.active:
            raise HTTPException(403, "Technician disabled")
    return issue(user, session, db)


@router.post("/auth/logout", status_code=204)
def logout(principal: Principal, db: DbSession):
    db.delete(principal[1])
    db.commit()


@router.get("/me")
def me(principal: Principal, db: DbSession):
    return user_out(principal[0], db)


def authorized_task(db, task_id: uuid.UUID, user: User) -> Task:
    task = get_task_or_404(db, task_id)
    if user.role == UserRole.technician and task.handyman_id != user.handyman_id:
        raise HTTPException(404, "Task not found")
    return task


def task_out(task: Task, user: User) -> dict:
    allowed = {
        TaskStatus.assigned: [TaskStatus.in_progress],
        TaskStatus.in_progress: [TaskStatus.done],
    }.get(task.status, [])
    customer = task.customer
    share = labor_earnings(task.labor_price, task.handyman_payout_percent)
    return {
        "id": str(task.id),
        "number": task.task_number,
        "title": task.title,
        "description": task.description,
        "category": task.category.value,
        "status": task.status.value,
        "revision": task.revision,
        "handyman_id": str(task.handyman_id) if task.handyman_id else None,
        "scheduled_date": task.scheduled_date,
        "time_window_start": task.time_window_start,
        "time_window_end": task.time_window_end,
        "completed_at": task.completed_at,
        "labor_price": str(task.labor_price),
        "materials_cost": str(task.materials_cost),
        "labor_earnings": str(share) if share is not None else None,
        "service_address": ", ".join(
            v for v in [task.street_address, task.city, task.state, task.zip] if v
        ),
        "customer": {"id": str(customer.id), "name": customer.full_name, "phone": customer.phone},
        "allowed_statuses": [s.value for s in allowed] if user.role == UserRole.technician else [],
    }


@router.get("/tasks")
def list_tasks(
    principal: Principal,
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=100),
):
    user = principal[0]
    query = select(Task)
    if user.role == UserRole.technician:
        query = query.where(Task.handyman_id == user.handyman_id)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    tasks = (
        db.scalars(
            query.order_by(Task.scheduled_date.desc().nulls_last(), Task.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .unique()
        .all()
    )
    return {"items": [task_out(t, user) for t in tasks], "total": total, "page": page}


@router.get("/tasks/{task_id}")
def detail(task_id: uuid.UUID, principal: Principal, db: DbSession):
    return task_out(authorized_task(db, task_id, principal[0]), principal[0])


class StatusInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: TaskStatus
    expected_revision: int = Field(ge=1)


@router.post("/tasks/{task_id}/status")
def change_status(task_id: uuid.UUID, payload: StatusInput, principal: Principal, db: DbSession):
    user = principal[0]
    task = authorized_task(db, task_id, user)
    if user.role != UserRole.technician:
        raise HTTPException(403, "Technician action required")
    if task.revision != payload.expected_revision:
        raise HTTPException(409, "Task changed; refresh and choose the status again")
    if payload.status.value not in task_out(task, user)["allowed_statuses"]:
        raise HTTPException(409, "Transition not permitted")
    set_status(db, task, payload.status, user)
    db.commit()
    db.refresh(task)
    return task_out(task, user)


class MobileAssignInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    handyman_id: uuid.UUID
    expected_revision: int = Field(ge=1)


@router.post("/tasks/{task_id}/assign")
def assign(task_id: uuid.UUID, payload: MobileAssignInput, principal: Principal, db: DbSession):
    from app.services.tasks import assign_task

    user = office(principal)
    task = get_task_or_404(db, task_id)
    if task.revision != payload.expected_revision:
        raise HTTPException(409, "Task changed; refresh and retry")
    assign_task(db, task, payload.handyman_id, user, explicit_assignment=True)
    db.commit()
    db.refresh(task)
    return task_out(task, user)


@router.post("/tasks", status_code=201)
def create_task(payload: TaskCreate, principal: Principal, db: DbSession):
    user = office(principal)
    customer = db.get(Customer, payload.customer_id)
    address_fields = {"street_address", "city", "state", "zip"}
    if customer and not (payload.model_fields_set & address_fields):
        payload = payload.model_copy(update={f: getattr(customer, f) for f in address_fields})
    task = office_tasks.create_task(payload, db, user)
    return task_out(task, user)


@router.get("/tasks/{task_id}/history")
def history(task_id: uuid.UUID, principal: Principal, db: DbSession):
    authorized_task(db, task_id, principal[0])
    events = db.scalars(
        select(TaskStatusHistory)
        .where(TaskStatusHistory.task_id == task_id)
        .order_by(TaskStatusHistory.changed_at, TaskStatusHistory.id)
    ).all()
    return [
        {
            "id": str(e.id),
            "jobId": str(e.task_id),
            "actorId": str(e.changed_by or ""),
            "at": e.changed_at,
            "kind": "status",
            "from": e.from_status.value if e.from_status else None,
            "to": e.to_status.value,
        }
        for e in events
    ]


@router.get("/team")
def team(principal: Principal, db: DbSession):
    office(principal)
    accounts = {
        u.handyman_id: u
        for u in db.scalars(select(User).where(User.role == UserRole.technician)).all()
    }
    return [
        {
            "id": str(accounts[h.id].id) if h.id in accounts else "handyman:" + str(h.id),
            "handyman_id": str(h.id),
            "name": h.full_name,
            "phone": h.phone,
            "email": accounts[h.id].email if h.id in accounts else h.email,
            "role": "technician",
            "has_account": h.id in accounts,
            "is_active": h.status == HandymanStatus.active
            and (accounts[h.id].is_active if h.id in accounts else True),
        }
        for h in db.scalars(select(Handyman).order_by(Handyman.full_name)).all()
    ]


class TechnicianInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    handyman_id: uuid.UUID
    email: EmailStr
    password: str = Field(min_length=12, max_length=72)


@router.post("/technicians", status_code=201)
def create_technician(payload: TechnicianInput, principal: Principal, db: DbSession):
    office(principal, admin=True)
    if len(payload.password.encode()) > 72:
        raise HTTPException(422, "Password exceeds bcrypt byte limit")
    handyman = db.get(Handyman, payload.handyman_id)
    if not handyman or handyman.status != HandymanStatus.active:
        raise HTTPException(409, "Choose an active handyman")
    if db.scalar(
        select(User.id).where(
            (func.lower(User.email) == payload.email.lower()) | (User.handyman_id == handyman.id)
        )
    ):
        raise HTTPException(409, "Email or handyman already has an account")
    user = User(
        email=payload.email.lower(),
        full_name=handyman.full_name,
        password_hash=hash_password(payload.password),
        role=UserRole.technician,
        handyman_id=handyman.id,
        is_active=True,
        must_change_password=False,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Account already exists") from None
    return user_out(user, db)

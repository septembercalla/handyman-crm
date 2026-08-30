import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select

from app.core.deps import CurrentUser, DbSession
from app.models import Handyman, HandymanStatus, Task
from app.schemas import HandymanCreate, HandymanOut, HandymanUpdate, TaskOut

router = APIRouter(prefix="/handymen", tags=["handymen"])


def _get_or_404(db, handyman_id: uuid.UUID) -> Handyman:
    handyman = db.get(Handyman, handyman_id)
    if not handyman:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Handyman not found")
    return handyman


@router.get("", response_model=list[HandymanOut])
def list_handymen(
    db: DbSession,
    _: CurrentUser,
    status_filter: Annotated[HandymanStatus | None, Query(alias="status")] = None,
    search: str | None = None,
) -> list[Handyman]:
    stmt = select(Handyman)
    if status_filter is not None:
        stmt = stmt.where(Handyman.status == status_filter)
    if search:
        needle = f"%{search.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Handyman.full_name).like(needle),
                func.lower(Handyman.email).like(needle),
                func.lower(Handyman.phone).like(needle),
            )
        )
    stmt = stmt.order_by(Handyman.full_name)
    return list(db.execute(stmt).scalars().all())


@router.post("", response_model=HandymanOut, status_code=status.HTTP_201_CREATED)
def create_handyman(payload: HandymanCreate, db: DbSession, _: CurrentUser) -> Handyman:
    handyman = Handyman(**payload.model_dump())
    db.add(handyman)
    db.commit()
    db.refresh(handyman)
    return handyman


@router.get("/{handyman_id}", response_model=HandymanOut)
def get_handyman(handyman_id: uuid.UUID, db: DbSession, _: CurrentUser) -> Handyman:
    return _get_or_404(db, handyman_id)


@router.patch("/{handyman_id}", response_model=HandymanOut)
def update_handyman(
    handyman_id: uuid.UUID, payload: HandymanUpdate, db: DbSession, _: CurrentUser
) -> Handyman:
    handyman = _get_or_404(db, handyman_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(handyman, key, value)
    db.commit()
    db.refresh(handyman)
    return handyman


@router.get("/{handyman_id}/tasks", response_model=list[TaskOut])
def handyman_tasks(
    handyman_id: uuid.UUID,
    db: DbSession,
    _: CurrentUser,
    day: Annotated[date | None, Query(alias="date")] = None,
) -> list[Task]:
    """
    GET /handymen/{id}/tasks?date=YYYY-MM-DD — the day's stops, ordered by time.
    Without `date` it returns every task of that handyman, newest schedule first.
    """
    _get_or_404(db, handyman_id)
    stmt = select(Task).where(Task.handyman_id == handyman_id)
    if day is not None:
        stmt = stmt.where(Task.scheduled_date == day).order_by(
            Task.time_window_start.asc().nulls_last(), Task.task_number
        )
    else:
        stmt = stmt.order_by(Task.scheduled_date.desc().nulls_last(), Task.task_number)
    return list(db.execute(stmt).unique().scalars().all())

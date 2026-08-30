from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.config import settings
from app.core.deps import CurrentUser, DbSession
from app.models import Handyman, HandymanStatus, Task, TaskStatus
from app.schemas import ScheduleRow, ScheduleTravelOut, TravelLegOut
from app.schemas.handyman import HandymanOut
from app.schemas.task import TaskOut
from app.services.routing import available_minutes, compute_route

router = APIRouter(tags=["schedule"])


@router.get("/schedule", response_model=list[ScheduleRow])
def schedule_for_day(
    db: DbSession,
    _: CurrentUser,
    day: Annotated[date | None, Query(alias="date")] = None,
) -> list[ScheduleRow]:
    """GET /schedule?date=YYYY-MM-DD — one row per active handyman."""
    target = day or date.today()

    handymen = (
        db.execute(
            select(Handyman)
            .where(Handyman.status == HandymanStatus.active)
            .order_by(Handyman.full_name)
        )
        .scalars()
        .all()
    )

    tasks = (
        db.execute(
            select(Task)
            .where(Task.scheduled_date == target, Task.handyman_id.is_not(None))
            .order_by(Task.time_window_start.asc().nulls_last(), Task.task_number)
        )
        .unique()
        .scalars()
        .all()
    )

    by_handyman: dict = {}
    for task in tasks:
        by_handyman.setdefault(task.handyman_id, []).append(task)

    return [
        ScheduleRow(
            handyman=HandymanOut.model_validate(h),
            tasks=[TaskOut.model_validate(t) for t in by_handyman.get(h.id, [])],
        )
        for h in handymen
    ]


@router.get("/schedule/unassigned", response_model=list[TaskOut])
def unassigned_tasks(
    db: DbSession,
    _: CurrentUser,
    day: Annotated[date | None, Query(alias="date")] = None,
) -> list[Task]:
    """
    The pool the dispatcher drags from. Without `date` it returns every open task
    with no handyman; with one it also keeps tasks that have no date yet.
    """
    stmt = select(Task).where(Task.handyman_id.is_(None), Task.status == TaskStatus.new)
    if day is not None:
        stmt = stmt.where(
            (Task.scheduled_date == day) | (Task.scheduled_date.is_(None))
        )
    stmt = stmt.order_by(Task.scheduled_date.asc().nulls_last(), Task.task_number)
    return list(db.execute(stmt).unique().scalars().all())


@router.get("/schedule/travel", response_model=ScheduleTravelOut)
def schedule_travel(
    db: DbSession,
    _: CurrentUser,
    day: Annotated[date | None, Query(alias="date")] = None,
) -> ScheduleTravelOut:
    """Road travel estimates between each handyman's consecutive daily jobs."""
    target = day or date.today()
    tasks = (
        db.execute(
            select(Task)
            .where(Task.scheduled_date == target, Task.handyman_id.is_not(None))
            .order_by(
                Task.handyman_id,
                Task.time_window_start.asc().nulls_last(),
                Task.task_number,
            )
        )
        .unique()
        .scalars()
        .all()
    )

    grouped: dict = {}
    for task in tasks:
        grouped.setdefault(task.handyman_id, []).append(task)

    legs: list[TravelLegOut] = []
    api_key = settings.google_server_api_key
    for handyman_id, jobs in grouped.items():
        for previous, following in zip(jobs, jobs[1:], strict=False):
            available = available_minutes(
                previous.time_window_end, following.time_window_start
            )
            if None in (
                previous.latitude,
                previous.longitude,
                following.latitude,
                following.longitude,
            ):
                legs.append(
                    TravelLegOut(
                        handyman_id=handyman_id,
                        from_task_id=previous.id,
                        to_task_id=following.id,
                        available_minutes=available,
                        status="missing_coordinates",
                    )
                )
                continue

            estimate = compute_route(
                (previous.latitude, previous.longitude),
                (following.latitude, following.longitude),
                api_key,
            )
            if estimate is None:
                legs.append(
                    TravelLegOut(
                        handyman_id=handyman_id,
                        from_task_id=previous.id,
                        to_task_id=following.id,
                        available_minutes=available,
                        status="unavailable",
                    )
                )
                continue

            conflict = (
                max(0, estimate.duration_minutes - available)
                if available is not None
                else None
            )
            legs.append(
                TravelLegOut(
                    handyman_id=handyman_id,
                    from_task_id=previous.id,
                    to_task_id=following.id,
                    drive_minutes=estimate.duration_minutes,
                    distance_meters=estimate.distance_meters,
                    available_minutes=available,
                    conflict_minutes=conflict,
                    encoded_polyline=estimate.encoded_polyline,
                    status="conflict" if conflict and conflict > 0 else "ok",
                )
            )

    return ScheduleTravelOut(routes_configured=bool(api_key), legs=legs)

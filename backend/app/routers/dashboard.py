from zoneinfo import ZoneInfo

from fastapi import APIRouter
from sqlalchemy import func, select

from app.config import settings
from app.core.deps import CurrentUser, DbSession
from app.models import Task, TaskStatus
from app.schemas import DashboardStats, StatusCounts
from app.schemas.task import TaskOut
from app.services import operations
from app.services.tasks import status_counts

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStats)
def stats(db: DbSession, _: CurrentUser) -> DashboardStats:
    """GET /dashboard/stats — everything the Home screen needs in one round trip."""
    start, end, _, _ = operations.business_period(operations.utcnow())
    today = start.astimezone(ZoneInfo(settings.BUSINESS_TIMEZONE)).date()

    done_today = db.execute(
        select(func.count())
        .select_from(Task)
        .where(Task.status == TaskStatus.done, Task.completed_at >= start, Task.completed_at < end)
    ).scalar_one()

    unassigned_count = db.execute(
        select(func.count())
        .select_from(Task)
        .where(Task.handyman_id.is_(None), Task.status == TaskStatus.new)
    ).scalar_one()

    today_tasks = (
        db.execute(
            select(Task)
            .where(Task.scheduled_date == today)
            .order_by(Task.time_window_start.asc().nulls_last(), Task.task_number)
        )
        .unique()
        .scalars()
        .all()
    )

    needs_assignment = (
        db.execute(
            select(Task)
            .where(Task.handyman_id.is_(None), Task.status == TaskStatus.new)
            .order_by(Task.scheduled_date.asc().nulls_last(), Task.task_number)
        )
        .unique()
        .scalars()
        .all()
    )

    return DashboardStats(
        business_date=today,
        timezone=settings.BUSINESS_TIMEZONE,
        counts=StatusCounts(**status_counts(db)),
        done_today=done_today,
        unassigned=unassigned_count,
        today=[TaskOut.model_validate(t) for t in today_tasks],
        needs_assignment=[TaskOut.model_validate(t) for t in needs_assignment],
    )

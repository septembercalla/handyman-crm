"""Read-only weekly worker report using the CRM's existing financial rules."""

import uuid
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import and_, or_, select

from app.config import settings
from app.core.deps import AdminUser, DbSession
from app.models import Handyman, Task, TaskStatus
from app.services.financials import (
    customer_total,
    labor_earnings,
    materials_reimbursement,
    money,
    total_handyman_payout,
)

router = APIRouter(prefix="/trips", tags=["trips"])


class TripJob(BaseModel):
    id: uuid.UUID
    number: str
    title: str
    status: TaskStatus
    customer_name: str
    customer_phone: str
    service_address: str
    scheduled_date: date | None
    completed_date: date | None
    time_window_start: time | None
    time_window_end: time | None
    labor_price: Decimal
    materials_cost: Decimal
    job_value: Decimal
    payout_percent: Decimal | None
    labor_earnings: Decimal | None
    materials_reimbursement: Decimal | None
    total_payout: Decimal | None


class Totals(BaseModel):
    completed_jobs: int = 0
    scheduled_jobs: int = 0
    payout_not_set: int = 0
    labor_total: Decimal = Decimal("0.00")
    materials_total: Decimal = Decimal("0.00")
    job_value: Decimal = Decimal("0.00")
    labor_earnings: Decimal = Decimal("0.00")
    materials_reimbursement: Decimal = Decimal("0.00")
    total_payout: Decimal = Decimal("0.00")


class TripDay(Totals):
    date: date
    jobs: list[TripJob]


class WeeklyTrip(Totals):
    handyman_id: uuid.UUID
    handyman_name: str
    handyman_status: str
    timezone: str
    week_start: date
    week_end: date
    days: list[TripDay]


def sum_jobs(jobs: list[TripJob]) -> dict:
    completed = [job for job in jobs if job.status == TaskStatus.done]
    known = [job for job in completed if job.payout_percent is not None]
    return {
        "completed_jobs": len(completed),
        "scheduled_jobs": sum(
            job.status not in {TaskStatus.done, TaskStatus.cancelled} for job in jobs
        ),
        "payout_not_set": len(completed) - len(known),
        "labor_total": money(sum((job.labor_price for job in completed), Decimal(0))),
        "materials_total": money(sum((job.materials_cost for job in completed), Decimal(0))),
        "job_value": money(sum((job.job_value for job in completed), Decimal(0))),
        **{
            field: money(sum((getattr(job, field) for job in known), Decimal(0)))
            for field in ("labor_earnings", "materials_reimbursement", "total_payout")
        },
    }


@router.get("/{handyman_id}", response_model=WeeklyTrip)
def weekly_trip(
    handyman_id: uuid.UUID, db: DbSession, _: AdminUser, week_start: date | None = None
):
    handyman = db.get(Handyman, handyman_id)
    if not handyman:
        raise HTTPException(404, "Worker not found")
    zone = ZoneInfo(settings.BUSINESS_TIMEZONE)
    requested = week_start or datetime.now(zone).date()
    monday = requested - timedelta(days=requested.weekday())
    next_monday = monday + timedelta(days=7)
    start = datetime.combine(monday, time.min, zone).astimezone(UTC)
    end = datetime.combine(next_monday, time.min, zone).astimezone(UTC)
    tasks = (
        db.scalars(
            select(Task)
            .where(
                Task.handyman_id == handyman_id,
                or_(
                    and_(
                        Task.status == TaskStatus.done,
                        Task.completed_at >= start,
                        Task.completed_at < end,
                    ),
                    and_(
                        Task.status != TaskStatus.done,
                        Task.scheduled_date >= monday,
                        Task.scheduled_date < next_monday,
                    ),
                ),
            )
            .order_by(Task.time_window_start.asc().nulls_last(), Task.task_number)
        )
        .unique()
        .all()
    )
    by_day = {monday + timedelta(days=i): [] for i in range(7)}
    for task in tasks:
        completed_date = None
        if task.status == TaskStatus.done:
            stamp = task.completed_at
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=UTC)
            completed_date = stamp.astimezone(zone).date()
        day = completed_date or task.scheduled_date
        resolved = task.status == TaskStatus.done and task.handyman_payout_percent is not None
        row = TripJob(
            id=task.id,
            number=task.task_number,
            title=task.title,
            status=task.status,
            customer_name=task.customer.full_name if task.customer else "—",
            customer_phone=task.customer.phone if task.customer else "",
            service_address=", ".join(
                v for v in (task.street_address, task.city, task.state, task.zip) if v
            ),
            scheduled_date=task.scheduled_date,
            completed_date=completed_date,
            time_window_start=task.time_window_start,
            time_window_end=task.time_window_end,
            labor_price=money(task.labor_price),
            materials_cost=money(task.materials_cost),
            job_value=customer_total(task.labor_price, task.materials_cost),
            payout_percent=task.handyman_payout_percent,
            labor_earnings=labor_earnings(task.labor_price, task.handyman_payout_percent)
            if resolved
            else None,
            materials_reimbursement=materials_reimbursement(
                task.materials_cost, task.materials_paid_by
            )
            if resolved
            else None,
            total_payout=total_handyman_payout(
                task.labor_price,
                task.materials_cost,
                task.materials_paid_by,
                task.handyman_payout_percent,
            )
            if resolved
            else None,
        )
        by_day[day].append(row)
    days = [TripDay(date=day, jobs=jobs, **sum_jobs(jobs)) for day, jobs in by_day.items()]
    return WeeklyTrip(
        handyman_id=handyman.id,
        handyman_name=handyman.full_name,
        handyman_status=handyman.status.value,
        timezone=settings.BUSINESS_TIMEZONE,
        week_start=monday,
        week_end=next_monday - timedelta(days=1),
        days=days,
        **sum_jobs([job for day in days for job in day.jobs]),
    )

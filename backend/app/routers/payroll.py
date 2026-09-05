from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import APIRouter
from sqlalchemy import select

from app.config import settings
from app.core.deps import AdminUser, DbSession
from app.models import Handyman, Task, TaskStatus
from app.schemas import HandymanPayrollOut, PayrollTaskOut, WeeklyPayrollOut
from app.services.financials import (
    labor_earnings,
    materials_reimbursement,
    money,
    total_handyman_payout,
)

router = APIRouter(prefix="/payroll", tags=["payroll"])


@router.get("", response_model=WeeklyPayrollOut)
def weekly_payroll(
    db: DbSession,
    _: AdminUser,
    week_start: date | None = None,
) -> WeeklyPayrollOut:
    business_timezone = ZoneInfo(settings.BUSINESS_TIMEZONE)
    requested_day = week_start or datetime.now(business_timezone).date()
    first_day = requested_day - timedelta(days=requested_day.weekday())
    last_day = first_day + timedelta(days=6)
    # Construct both local midnights before converting to UTC: DST weeks can
    # contain 167 or 169 hours rather than 168.
    period_start = datetime.combine(first_day, time.min, tzinfo=business_timezone).astimezone(UTC)
    period_end = datetime.combine(
        first_day + timedelta(days=7), time.min, tzinfo=business_timezone
    ).astimezone(UTC)

    handymen = list(db.scalars(select(Handyman).order_by(Handyman.full_name)))
    completed_tasks = list(
        db.execute(
            select(Task)
            .where(
                Task.status == TaskStatus.done,
                Task.completed_at.is_not(None),
                Task.completed_at >= period_start,
                Task.completed_at < period_end,
                Task.handyman_id.is_not(None),
            )
            .order_by(Task.completed_at, Task.task_number)
        )
        .unique()
        .scalars()
    )

    tasks_by_handyman: dict[object, list[Task]] = defaultdict(list)
    for task in completed_tasks:
        tasks_by_handyman[task.handyman_id].append(task)

    summaries: list[HandymanPayrollOut] = []
    for handyman in handymen:
        rows: list[PayrollTaskOut] = []
        for task in tasks_by_handyman[handyman.id]:
            payout_percent = task.handyman_payout_percent
            resolved = payout_percent is not None
            earnings = (
                labor_earnings(task.labor_price, payout_percent) if resolved else None
            )
            reimbursement = (
                materials_reimbursement(task.materials_cost, task.materials_paid_by)
                if resolved
                else None
            )
            rows.append(
                PayrollTaskOut(
                    task_id=task.id,
                    task_number=task.task_number,
                    completed_at=task.completed_at,
                    completed_date=(
                        task.completed_at.replace(tzinfo=UTC)
                        if task.completed_at.tzinfo is None
                        else task.completed_at
                    ).astimezone(business_timezone).date(),
                    customer_name=task.customer.full_name if task.customer else "—",
                    labor_price=money(task.labor_price),
                    materials_cost=money(task.materials_cost),
                    materials_paid_by=task.materials_paid_by,
                    payout_percent=payout_percent,
                    labor_earnings=earnings,
                    materials_reimbursement=reimbursement,
                    total_payout=(
                        total_handyman_payout(
                            task.labor_price,
                            task.materials_cost,
                            task.materials_paid_by,
                            payout_percent,
                        )
                        if resolved
                        else None
                    ),
                )
            )

        calculated_rows = [row for row in rows if row.payout_percent is not None]
        summaries.append(
            HandymanPayrollOut(
                handyman_id=handyman.id,
                handyman_name=handyman.full_name,
                completed_jobs=len(rows),
                calculated_jobs=len(calculated_rows),
                payout_not_set=len(rows) - len(calculated_rows),
                labor_revenue=money(
                    sum((row.labor_price for row in calculated_rows), Decimal(0))
                ),
                labor_earnings=money(
                    sum(
                        (row.labor_earnings for row in calculated_rows),
                        Decimal(0),
                    )
                ),
                materials_reimbursement=money(
                    sum(
                        (row.materials_reimbursement for row in calculated_rows),
                        Decimal(0),
                    )
                ),
                total_payout=money(
                    sum((row.total_payout for row in calculated_rows), Decimal(0))
                ),
                tasks=rows,
            )
        )

    return WeeklyPayrollOut(
        timezone=settings.BUSINESS_TIMEZONE,
        week_start=first_day,
        week_end=last_day,
        handymen=summaries,
    )

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import and_, or_

from app.config import settings
from app.models import Task, TaskStatus
from app.models.lead import Lead


def utcnow() -> datetime:
    return datetime.now(UTC)


def follow_up_label(value: datetime | None) -> str:
    if value is None:
        return "cleared"
    local = value.astimezone(ZoneInfo(settings.BUSINESS_TIMEZONE))
    return f"{local:%Y-%m-%d %H:%M:%S %Z} ({settings.BUSINESS_TIMEZONE})"


def business_midnight(day: date) -> datetime:
    return datetime.combine(day, time.min, ZoneInfo(settings.BUSINESS_TIMEZONE)).astimezone(UTC)


def business_period(now: datetime) -> tuple[datetime, datetime, datetime, datetime]:
    today = now.astimezone(ZoneInfo(settings.BUSINESS_TIMEZONE)).date()
    monday = today - timedelta(days=today.weekday())
    return (
        business_midnight(today),
        business_midnight(today + timedelta(days=1)),
        business_midnight(monday),
        business_midnight(monday + timedelta(days=7)),
    )


def follow_up_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.astimezone(UTC)
    zone = ZoneInfo(settings.BUSINESS_TIMEZONE)
    first, second = value.replace(tzinfo=zone, fold=0), value.replace(tzinfo=zone, fold=1)
    if (
        first.utcoffset() != second.utcoffset()
        or first.astimezone(UTC).astimezone(zone).replace(tzinfo=None) != value
    ):
        raise HTTPException(
            422, "Follow-up time is ambiguous or nonexistent due to daylight saving"
        )
    return first.astimezone(UTC)


def attention_condition(kind: str, now: datetime, stale_hours: int = 48):
    today, tomorrow, _, _ = business_period(now)
    open_lead = Lead.stage.in_(["new", "contacting", "qualified"])
    conditions = {
        "new": and_(Lead.stage == "new", Lead.first_contacted_at.is_(None)),
        "due_today": and_(Lead.next_follow_up_at >= today, Lead.next_follow_up_at < tomorrow),
        "overdue": Lead.next_follow_up_at < now,
        "no_answer": Lead.latest_contact_outcome == "no_answer",
        "stale": Lead.last_activity_at < now - timedelta(hours=stale_hours),
        "needs_follow_up": or_(
            and_(Lead.stage == "new", Lead.first_contacted_at.is_(None)),
            Lead.next_follow_up_at < tomorrow,
            and_(
                Lead.next_follow_up_at.is_(None),
                Lead.latest_contact_outcome == "no_answer",
            ),
            and_(
                Lead.last_activity_at < now - timedelta(hours=stale_hours),
                or_(Lead.next_follow_up_at.is_(None), Lead.next_follow_up_at <= now),
            ),
        ),
    }
    return and_(open_lead, conditions[kind])


def follow_up_state(lead, now: datetime) -> str:
    if lead.stage in {"booked", "lost"} or lead.next_follow_up_at is None:
        return "none"
    due = lead.next_follow_up_at
    if due.tzinfo is None:  # SQLite tests return naive UTC; PostgreSQL uses timestamptz.
        due = due.replace(tzinfo=UTC)
    if due < now:
        return "overdue"
    today, tomorrow, _, _ = business_period(now)
    return "due_today" if today <= due < tomorrow else "scheduled"


def review_pending_condition():
    return and_(
        Task.status == TaskStatus.done, Task.review_status.in_(["not_requested", "requested"])
    )

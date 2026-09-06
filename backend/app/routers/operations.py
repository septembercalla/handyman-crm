import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import lazyload

from app.config import settings
from app.core.deps import CurrentUser, DbSession
from app.models import Task, TaskStatus
from app.models.lead import Lead
from app.schemas.review import ReviewInput
from app.schemas.task import TaskOut
from app.services import operations

router = APIRouter(tags=["operations"])


class OperationalStats(BaseModel):
    timezone: str
    new_leads: int
    needs_follow_up: int
    no_answer: int
    booked_this_week: int
    completed_this_week: int
    reviews_pending: int
    five_star_this_week: int


@router.get("/operations", response_model=OperationalStats)
def stats(db: DbSession, _: CurrentUser):
    now = operations.utcnow()
    _, _, start, end = operations.business_period(now)

    def count(model, *conditions):
        return db.scalar(select(func.count()).select_from(model).where(*conditions))

    return OperationalStats(
        timezone=settings.BUSINESS_TIMEZONE,
        new_leads=count(Lead, operations.attention_condition("new", now)),
        needs_follow_up=count(Lead, operations.attention_condition("needs_follow_up", now)),
        no_answer=count(Lead, operations.attention_condition("no_answer", now)),
        booked_this_week=count(Lead, Lead.booked_at >= start, Lead.booked_at < end),
        completed_this_week=count(
            Task,
            Task.status == TaskStatus.done,
            Task.completed_at >= start,
            Task.completed_at < end,
        ),
        reviews_pending=count(Task, operations.review_pending_condition()),
        five_star_this_week=count(
            Task,
            Task.review_status == "received",
            Task.review_rating == 5,
            Task.review_received_at >= start,
            Task.review_received_at < end,
        ),
    )


@router.post("/tasks/{task_id}/review", response_model=TaskOut)
def review(task_id: uuid.UUID, payload: ReviewInput, db: DbSession, _: CurrentUser):
    task = db.scalar(
        select(Task)
        .options(lazyload(Task.customer), lazyload(Task.handyman))
        .where(Task.id == task_id)
        .with_for_update()
    )
    if task is None:
        raise HTTPException(404, "Task not found")
    if task.status != TaskStatus.done:
        raise HTTPException(409, "Reviews can only be tracked for completed tasks")
    if task.review_status == "received" and payload.status != "received":
        raise HTTPException(409, "A received review cannot be reset")
    now = operations.utcnow()
    if payload.status == "requested" and task.review_requested_at is None:
        task.review_requested_at = now
    if payload.status == "received":
        task.review_received_at = task.review_received_at or now
        task.review_rating, task.review_platform = payload.rating, payload.platform
    task.review_status = payload.status
    db.commit()
    db.refresh(task)
    return task

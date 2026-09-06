"""
Business rules for tasks (SPEC §4).

Assignment lives here on purpose: swapping `tasks.handyman_id` for a
`task_assignments` join table later means rewriting `assign_task`, not half the
routers.
"""

import re
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import case, func, select, update
from sqlalchemy.orm import Session

from app.models import (
    STATUS_TRANSITIONS,
    TERMINAL_STATUSES,
    Handyman,
    HandymanStatus,
    Task,
    TaskNumberCounter,
    TaskStatus,
    TaskStatusHistory,
    User,
)
from app.services.geocoding import geocode

TASK_NUMBER_RE = re.compile(r"(\d+)$")


def next_task_number(
    db: Session, requested: str | None = None, *, task_id: uuid.UUID | None = None
) -> str:
    """Allocate under a DB row lock, held until the caller commits or rolls back.

    Explicit numbers use the same lock and advance the counter when necessary.
    No commit here: the number and its task belong to one transaction.
    """
    requested = (requested or "").strip()
    counter = TaskNumberCounter
    match = TASK_NUMBER_RE.search(requested)
    floor = int(match.group(1)) if match else 0
    if floor > 9223372036854775806:
        raise HTTPException(422, "Task number exceeds the supported numeric range")
    while True:
        value = db.scalar(
            update(counter)
            .where(counter.id == 1)
            .values(last_value=(
                case((counter.last_value < floor, floor), else_=counter.last_value)
                if requested else counter.last_value + 1
            ))
            .returning(counter.last_value)
        )
        if value is None:
            raise RuntimeError("Task number counter is not initialized; apply the CRM migration")
        number = requested or f"T-{value}"
        existing = select(Task.id).where(Task.task_number == number)
        if task_id is not None:
            existing = existing.where(Task.id != task_id)
        if db.scalar(existing) is None:
            return number
        if requested:
            raise HTTPException(409, "Task number already exists")
        # Also tolerate numbers inserted outside the application after initialization.


def record_status_change(
    db: Session,
    task: Task,
    from_status: TaskStatus | None,
    to_status: TaskStatus,
    user: User | None,
) -> None:
    db.add(
        TaskStatusHistory(
            task_id=task.id,
            from_status=from_status,
            to_status=to_status,
            changed_by=user.id if user else None,
        )
    )


def refresh_coordinates(task: Task) -> None:
    """Called whenever the address changes; leaves the task untouched on failure."""
    coords = geocode(task.street_address, task.city, task.state, task.zip)
    if coords:
        task.latitude, task.longitude = coords


def assign_task(
    db: Session,
    task: Task,
    handyman_id: uuid.UUID | None,
    user: User | None,
    *,
    explicit_assignment: bool = False,
) -> Task:
    """
    Assign or unassign a handyman.

    new → assigned when someone is set; assigned → new when the handyman is
    removed (SPEC §4). Closed tasks cannot be reassigned.
    """
    if task.status in TERMINAL_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Task is closed and cannot be reassigned",
        )

    if handyman_id is not None:
        handyman = db.get(Handyman, handyman_id)
        if handyman is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Handyman not found",
            )
        if (
            handyman.status is HandymanStatus.inactive
            and task.handyman_id != handyman_id
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Inactive handymen cannot receive new assignments",
            )

    previous = task.status
    handyman_changed = task.handyman_id != handyman_id
    task.handyman_id = handyman_id
    if handyman_changed or (explicit_assignment and task.handyman_payout_percent is None):
        task.handyman_payout_percent = (
            handyman.default_payout_percent if handyman_id is not None else None
        )

    if handyman_id and task.status == TaskStatus.new:
        task.status = TaskStatus.assigned
    elif handyman_id is None and task.status == TaskStatus.assigned:
        task.status = TaskStatus.new

    if previous != task.status:
        record_status_change(db, task, previous, task.status, user)

    return task


def set_status(db: Session, task: Task, new_status: TaskStatus, user: User | None) -> Task:
    """Move a task along the lifecycle, refusing transitions the spec forbids."""
    if new_status == task.status:
        return task

    if new_status not in STATUS_TRANSITIONS[task.status]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot move {task.status.value} -> {new_status.value}",
        )

    if new_status == TaskStatus.assigned and task.handyman_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Assign a handyman first",
        )

    previous = task.status
    task.status = new_status

    now = datetime.now(UTC)
    if new_status == TaskStatus.in_progress and task.started_at is None:
        task.started_at = now
    if new_status == TaskStatus.done:
        task.completed_at = now
    if new_status == TaskStatus.new:
        # unassigned back to the pool
        task.handyman_id = None
        task.handyman_payout_percent = None

    record_status_change(db, task, previous, new_status, user)
    return task


def get_task_or_404(db: Session, task_id: uuid.UUID) -> Task:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


def status_counts(db: Session) -> dict[str, int]:
    rows = db.execute(select(Task.status, func.count()).group_by(Task.status)).all()
    counts = {s.value: 0 for s in TaskStatus}
    for task_status, count in rows:
        counts[task_status.value] = count
    return counts

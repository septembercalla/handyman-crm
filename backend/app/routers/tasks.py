import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import aliased

from app.core.deps import CurrentUser, DbSession
from app.models import (
    Customer,
    Handyman,
    Task,
    TaskCategory,
    TaskPriority,
    TaskStatus,
    TaskStatusHistory,
    User,
    UserRole,
)
from app.schemas import (
    AssignRequest,
    Paginated,
    SetStatusRequest,
    TaskCreate,
    TaskOut,
    TaskStatusHistoryOut,
    TaskUpdate,
)
from app.services.tasks import (
    assign_task,
    get_task_or_404,
    next_task_number,
    record_status_change,
    refresh_coordinates,
    set_status,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])

#: ordering=<field> / -<field>; the keys match what the frontend sends
ORDERING_FIELDS = {
    "task_number": Task.task_number,
    "title": Task.title,
    "category": Task.category,
    "priority": Task.priority,
    "status": Task.status,
    "scheduled_date": Task.scheduled_date,
    "created_at": Task.created_at,
    "updated_at": Task.updated_at,
}

ADDRESS_FIELDS = {"street_address", "city", "state", "zip"}
FINANCIAL_FIELDS = {
    "labor_price",
    "materials_cost",
    "materials_paid_by",
    "handyman_payout_percent",
}


def _apply_filters(
    stmt: Select,
    customer_join,
    handyman_join,
    *,
    status_: TaskStatus | None,
    handyman_id: uuid.UUID | None,
    category: TaskCategory | None,
    priority: TaskPriority | None,
    date_from: date | None,
    date_to: date | None,
    search: str | None,
    unassigned: bool,
) -> Select:
    if status_ is not None:
        stmt = stmt.where(Task.status == status_)
    if category is not None:
        stmt = stmt.where(Task.category == category)
    if priority is not None:
        stmt = stmt.where(Task.priority == priority)
    if handyman_id is not None:
        stmt = stmt.where(Task.handyman_id == handyman_id)
    if unassigned:
        stmt = stmt.where(Task.handyman_id.is_(None))
    if date_from is not None:
        stmt = stmt.where(Task.scheduled_date >= date_from)
    if date_to is not None:
        stmt = stmt.where(Task.scheduled_date <= date_to)
    if search:
        needle = f"%{search.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Task.task_number).like(needle),
                func.lower(Task.title).like(needle),
                func.lower(Task.street_address).like(needle),
                func.lower(Task.city).like(needle),
                func.lower(Task.zip).like(needle),
                func.lower(customer_join.full_name).like(needle),
                func.lower(func.coalesce(handyman_join.full_name, "")).like(needle),
            )
        )
    return stmt


@router.get("", response_model=Paginated[TaskOut])
def list_tasks(
    db: DbSession,
    _: CurrentUser,
    status_: Annotated[TaskStatus | None, Query(alias="status")] = None,
    handyman_id: uuid.UUID | None = None,
    category: TaskCategory | None = None,
    priority: TaskPriority | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    search: str | None = None,
    unassigned: bool = False,
    ordering: str = "-created_at",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 25,
) -> Paginated[TaskOut]:
    """GET /tasks — filters, ordering and pagination all live in query params (SPEC §5)."""
    cust = aliased(Customer)
    hand = aliased(Handyman)

    base = select(Task).join(cust, Task.customer_id == cust.id).outerjoin(
        hand, Task.handyman_id == hand.id
    )
    base = _apply_filters(
        base,
        cust,
        hand,
        status_=status_,
        handyman_id=handyman_id,
        category=category,
        priority=priority,
        date_from=date_from,
        date_to=date_to,
        search=search,
        unassigned=unassigned,
    )

    count_stmt = select(func.count()).select_from(base.subquery())
    total = db.execute(count_stmt).scalar_one()

    descending = ordering.startswith("-")
    field = ordering[1:] if descending else ordering
    if field == "customer":
        column = cust.full_name
    elif field == "handyman":
        column = hand.full_name
    else:
        column = ORDERING_FIELDS.get(field, Task.created_at)

    order_by = column.desc().nulls_last() if descending else column.asc().nulls_last()
    stmt = base.order_by(order_by, Task.task_number).offset((page - 1) * page_size).limit(page_size)

    items = db.execute(stmt).unique().scalars().all()
    return Paginated[TaskOut](
        items=[TaskOut.model_validate(t) for t in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(payload: TaskCreate, db: DbSession, user: CurrentUser) -> Task:
    if db.get(Customer, payload.customer_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    if payload.handyman_id and db.get(Handyman, payload.handyman_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Handyman not found")

    payout_was_set = "handyman_payout_percent" in payload.model_fields_set
    if payout_was_set and user.role is not UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required to change payout percentage",
        )

    data = payload.model_dump(
        exclude={"task_number", "handyman_id", "handyman_payout_percent"}
    )
    task = Task(**data, created_by=user.id)
    task.task_number = (payload.task_number or "").strip() or next_task_number(db)

    db.add(task)
    db.flush()
    record_status_change(db, task, None, TaskStatus.new, user)

    if payload.handyman_id:
        assign_task(db, task, payload.handyman_id, user)
    if payout_was_set:
        if task.handyman_id is None and payload.handyman_payout_percent is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Assign a handyman before setting payout percentage",
            )
        task.handyman_payout_percent = payload.handyman_payout_percent

    refresh_coordinates(task)

    db.commit()
    db.refresh(task)
    return task


@router.get("/{task_id}", response_model=TaskOut)
def get_task(task_id: uuid.UUID, db: DbSession, _: CurrentUser) -> Task:
    return get_task_or_404(db, task_id)


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(
    task_id: uuid.UUID, payload: TaskUpdate, db: DbSession, user: CurrentUser
) -> Task:
    task = get_task_or_404(db, task_id)
    data = payload.model_dump(exclude_unset=True)

    payout_was_set = "handyman_payout_percent" in data
    if payout_was_set and user.role is not UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required to change payout percentage",
        )

    # Operational details stay locked after closure. Financial corrections remain
    # possible because the UI explicitly confirms changes to completed payroll.
    if task.status in {TaskStatus.done, TaskStatus.cancelled}:
        data = {
            key: value
            for key, value in data.items()
            if key == "internal_notes" or key in FINANCIAL_FIELDS
        }

    handyman_id = data.pop("handyman_id", "__unset__")
    payout_percent = data.pop("handyman_payout_percent", "__unset__")
    address_changed = any(f in data for f in ADDRESS_FIELDS)

    for key, value in data.items():
        setattr(task, key, value)

    if handyman_id != "__unset__":
        assign_task(db, task, handyman_id, user)

    if payout_percent != "__unset__":
        if task.handyman_id is None and payout_percent is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Assign a handyman before setting payout percentage",
            )
        task.handyman_payout_percent = payout_percent

    if address_changed:
        refresh_coordinates(task)

    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: uuid.UUID, db: DbSession, _: CurrentUser) -> None:
    task = get_task_or_404(db, task_id)
    db.delete(task)
    db.commit()


@router.post("/{task_id}/assign", response_model=TaskOut)
def assign(
    task_id: uuid.UUID, payload: AssignRequest, db: DbSession, user: CurrentUser
) -> Task:
    task = get_task_or_404(db, task_id)
    assign_task(
        db,
        task,
        payload.handyman_id,
        user,
        explicit_assignment=True,
    )
    db.commit()
    db.refresh(task)
    return task


@router.post("/{task_id}/status", response_model=TaskOut)
def change_status(
    task_id: uuid.UUID, payload: SetStatusRequest, db: DbSession, user: CurrentUser
) -> Task:
    task = get_task_or_404(db, task_id)
    set_status(db, task, payload.status, user)
    db.commit()
    db.refresh(task)
    return task


@router.get("/{task_id}/history", response_model=list[TaskStatusHistoryOut])
def task_history(
    task_id: uuid.UUID, db: DbSession, _: CurrentUser
) -> list[TaskStatusHistoryOut]:
    get_task_or_404(db, task_id)
    rows = (
        db.execute(
            select(TaskStatusHistory, User)
            .outerjoin(User, TaskStatusHistory.changed_by == User.id)
            .where(TaskStatusHistory.task_id == task_id)
            .order_by(TaskStatusHistory.changed_at)
        )
        .unique()
        .all()
    )
    return [
        TaskStatusHistoryOut(
            id=entry.id,
            task_id=entry.task_id,
            from_status=entry.from_status,
            to_status=entry.to_status,
            changed_by=entry.changed_by,
            changed_by_name=author.full_name if author else "System",
            changed_at=entry.changed_at,
        )
        for entry, author in rows
    ]

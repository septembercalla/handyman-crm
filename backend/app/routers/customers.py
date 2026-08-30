import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, or_, select

from app.core.deps import CurrentUser, DbSession
from app.models import Customer, Task
from app.schemas import CustomerCreate, CustomerOut, CustomerUpdate, TaskOut

router = APIRouter(prefix="/customers", tags=["customers"])


def _task_count_column():
    """One correlated subquery instead of fetching every task to count them."""
    return (
        select(func.count(Task.id))
        .where(Task.customer_id == Customer.id)
        .correlate(Customer)
        .scalar_subquery()
        .label("task_count")
    )


def _with_count(customer: Customer, count: int) -> CustomerOut:
    out = CustomerOut.model_validate(customer)
    out.task_count = count
    return out


def _get_or_404(db, customer_id: uuid.UUID) -> Customer:
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return customer


@router.get("", response_model=list[CustomerOut])
def list_customers(
    db: DbSession, _: CurrentUser, search: str | None = None
) -> list[CustomerOut]:
    stmt = select(Customer, _task_count_column())
    if search:
        needle = f"%{search.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Customer.full_name).like(needle),
                func.lower(Customer.phone).like(needle),
                func.lower(Customer.email).like(needle),
                func.lower(Customer.street_address).like(needle),
                func.lower(Customer.city).like(needle),
                func.lower(Customer.zip).like(needle),
            )
        )
    rows = db.execute(stmt.order_by(Customer.full_name)).all()
    return [_with_count(customer, count) for customer, count in rows]


@router.post("", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
def create_customer(payload: CustomerCreate, db: DbSession, _: CurrentUser) -> Customer:
    customer = Customer(**payload.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(customer_id: uuid.UUID, db: DbSession, _: CurrentUser) -> CustomerOut:
    customer = _get_or_404(db, customer_id)
    count = db.execute(
        select(func.count(Task.id)).where(Task.customer_id == customer.id)
    ).scalar_one()
    return _with_count(customer, count)


@router.patch("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: uuid.UUID, payload: CustomerUpdate, db: DbSession, _: CurrentUser
) -> Customer:
    customer = _get_or_404(db, customer_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(customer, key, value)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/{customer_id}/tasks", response_model=list[TaskOut])
def customer_tasks(customer_id: uuid.UUID, db: DbSession, _: CurrentUser) -> list[Task]:
    """Work history for the site — newest first."""
    _get_or_404(db, customer_id)
    stmt = (
        select(Task)
        .where(Task.customer_id == customer_id)
        .order_by(Task.created_at.desc())
    )
    return list(db.execute(stmt).unique().scalars().all())

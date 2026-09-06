import uuid
from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import (
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.customer import Customer
from app.models.enums import MaterialsPaidBy, TaskCategory, TaskPriority, TaskStatus
from app.models.handyman import Handyman


def _enum(enum_cls, name: str):
    return Enum(enum_cls, name=name, values_callable=lambda e: [m.value for m in e])


class Task(Base, TimestampMixin):
    """A work request (SPEC §3)."""

    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_tasks_status", "status"),
        Index("ix_tasks_scheduled_date", "scheduled_date"),
        Index("ix_tasks_handyman_scheduled", "handyman_id", "scheduled_date"),
        Index("ix_tasks_customer_id", "customer_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    task_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)

    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False
    )
    #: One task — one handyman. Assignment goes through services.tasks.assign_task,
    #: so swapping this for a task_assignments join table later touches one function.
    handyman_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("handymen.id", ondelete="SET NULL"), nullable=True
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[TaskCategory] = mapped_column(
        _enum(TaskCategory, "task_category"), default=TaskCategory.general, nullable=False
    )
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    priority: Mapped[TaskPriority] = mapped_column(
        _enum(TaskPriority, "task_priority"), default=TaskPriority.normal, nullable=False
    )
    status: Mapped[TaskStatus] = mapped_column(
        _enum(TaskStatus, "task_status"), default=TaskStatus.new, nullable=False
    )

    street_address: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    city: Mapped[str] = mapped_column(String(128), default="", nullable=False)
    state: Mapped[str] = mapped_column(String(2), default="", nullable=False)
    zip: Mapped[str] = mapped_column(String(16), default="", nullable=False)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)

    scheduled_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    time_window_start: Mapped[time | None] = mapped_column(Time, nullable=True)
    time_window_end: Mapped[time | None] = mapped_column(Time, nullable=True)
    estimated_duration_min: Mapped[int | None] = mapped_column(Integer, nullable=True)

    #: Legacy placeholder retained until a separate data audit establishes what
    #: any historical non-null values meant. New financial logic must not use it.
    price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    labor_price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), default=Decimal("0.00"), server_default="0.00", nullable=False
    )
    materials_cost: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), default=Decimal("0.00"), server_default="0.00", nullable=False
    )
    materials_paid_by: Mapped[MaterialsPaidBy] = mapped_column(
        _enum(MaterialsPaidBy, "materials_paid_by"),
        default=MaterialsPaidBy.company,
        server_default=MaterialsPaidBy.company.value,
        nullable=False,
    )
    handyman_payout_percent: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2), nullable=True
    )
    internal_notes: Mapped[str] = mapped_column(Text, default="", nullable=False)

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_status: Mapped[str] = mapped_column(
        String(32), default="not_requested", server_default="not_requested", index=True
    )
    review_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    review_received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    review_rating: Mapped[int | None] = mapped_column(Integer)
    review_platform: Mapped[str | None] = mapped_column(String(32))

    customer: Mapped[Customer] = relationship(lazy="joined")
    handyman: Mapped[Handyman | None] = relationship(lazy="joined")


class TaskStatusHistory(Base):
    """Written automatically on every status change (SPEC §3)."""

    __tablename__ = "task_status_history"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_status: Mapped[TaskStatus | None] = mapped_column(
        _enum(TaskStatus, "task_status"), nullable=True
    )
    to_status: Mapped[TaskStatus] = mapped_column(_enum(TaskStatus, "task_status"), nullable=False)
    changed_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    changed_by_user = relationship("User", lazy="joined")

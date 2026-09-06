import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Lead(Base, TimestampMixin):
    __tablename__ = "leads"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    source: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    external_reference: Mapped[str | None] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(64))
    email: Mapped[str | None] = mapped_column(String(255))
    service_requested: Mapped[str | None] = mapped_column(String(255))
    address: Mapped[str | None] = mapped_column(String(512))
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    stage: Mapped[str] = mapped_column(String(32), default="new", index=True)
    latest_contact_outcome: Mapped[str | None] = mapped_column(String(32))
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), index=True
    )
    first_contacted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_contacted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_follow_up_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    booked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    last_activity_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    contact_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    converted_customer_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), index=True
    )
    converted_task_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), unique=True
    )
    lost_reason: Mapped[str | None] = mapped_column(Text)
    lost_note: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(String(128))
    state: Mapped[str | None] = mapped_column(String(2))
    property_type: Mapped[str | None] = mapped_column(String(32))
    job_summary: Mapped[str | None] = mapped_column(String(500))
    assigned_dispatcher_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    assigned_dispatcher = relationship("User", lazy="selectin", viewonly=True)
    converted_task = relationship("Task", lazy="selectin", viewonly=True)
    zip_code: Mapped[str | None] = mapped_column(String(16))
    original_request: Mapped[str | None] = mapped_column(Text)
    source_lead_id: Mapped[str | None] = mapped_column(String(255))
    source_url: Mapped[str | None] = mapped_column(String(2048))
    lead_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    next_action: Mapped[str | None] = mapped_column(String(32))
    last_contact_method: Mapped[str | None] = mapped_column(String(32))
    qualified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    quote_type: Mapped[str] = mapped_column(
        String(32), default="not_quoted", server_default="not_quoted"
    )
    quoted_min: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    quoted_max: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    quoted_fixed_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    materials_included: Mapped[bool | None] = mapped_column(Boolean)
    quote_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lost_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    refund_status: Mapped[str | None] = mapped_column(String(32))


class LeadActivity(Base):
    """Append-only via the API; snapshots survive linked record edits/deletions."""

    __tablename__ = "lead_activities"
    __table_args__ = (UniqueConstraint("lead_id", "sequence", name="uq_lead_activity_sequence"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    sequence: Mapped[int] = mapped_column(Integer)
    lead_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("leads.id", ondelete="RESTRICT"), index=True
    )
    event_type: Mapped[str] = mapped_column(String(32))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    user_name: Mapped[str] = mapped_column(String(255))
    note: Mapped[str] = mapped_column(Text, default="")

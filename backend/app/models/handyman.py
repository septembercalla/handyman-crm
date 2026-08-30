import uuid
from decimal import Decimal

from sqlalchemy import Enum, Numeric, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin
from app.models.enums import HandymanStatus


class Handyman(Base, TimestampMixin):
    """Field workers. They do not sign in (SPEC §3)."""

    __tablename__ = "handymen"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    email: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    #: task categories this handyman can take
    skills: Mapped[list[str]] = mapped_column(
        ARRAY(Text), default=list, server_default="{}", nullable=False
    )
    hourly_rate: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    #: colour of this handyman's map markers
    color: Mapped[str] = mapped_column(String(9), default="#1A6FE0", nullable=False)
    status: Mapped[HandymanStatus] = mapped_column(
        Enum(
            HandymanStatus,
            name="handyman_status",
            values_callable=lambda e: [m.value for m in e],
        ),
        default=HandymanStatus.active,
        nullable=False,
        index=True,
    )
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)

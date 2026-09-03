import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.enums import HandymanDocumentType


class HandymanDocument(Base):
    """Private worker-file metadata. File bytes live in object storage."""

    __tablename__ = "handyman_documents"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    handyman_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("handymen.id", ondelete="CASCADE"), nullable=False, index=True
    )
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    document_type: Mapped[HandymanDocumentType] = mapped_column(
        Enum(
            HandymanDocumentType,
            name="handyman_document_type",
            values_callable=lambda values: [item.value for item in values],
        ),
        nullable=False,
    )
    storage_key: Mapped[str] = mapped_column(String(512), unique=True, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)

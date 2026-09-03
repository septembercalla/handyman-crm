"""add handyman profiles and documents

Revision ID: d7e4b31a0f62
Revises: c2a6e94d31b8
Create Date: 2026-08-31 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d7e4b31a0f62"
down_revision: str | None = "c2a6e94d31b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


document_type = postgresql.ENUM(
    "contract",
    "driver_license",
    "w9",
    "insurance",
    "certification",
    "other",
    name="handyman_document_type",
    create_type=False,
)


def upgrade() -> None:
    op.add_column(
        "handymen",
        sa.Column("street_address", sa.String(length=255), server_default="", nullable=False),
    )
    op.add_column(
        "handymen",
        sa.Column("city", sa.String(length=128), server_default="", nullable=False),
    )
    op.add_column(
        "handymen",
        sa.Column("state", sa.String(length=2), server_default="", nullable=False),
    )
    op.add_column(
        "handymen",
        sa.Column("zip", sa.String(length=16), server_default="", nullable=False),
    )
    op.add_column("handymen", sa.Column("latitude", sa.Float(), nullable=True))
    op.add_column("handymen", sa.Column("longitude", sa.Float(), nullable=True))

    document_type.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "handyman_documents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("handyman_id", sa.Uuid(), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("document_type", document_type, nullable=False),
        sa.Column("storage_key", sa.String(length=512), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("file_size", sa.BigInteger(), nullable=False),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("uploaded_by", sa.Uuid(), nullable=True),
        sa.Column("notes", sa.Text(), server_default="", nullable=False),
        sa.ForeignKeyConstraint(["handyman_id"], ["handymen.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_key"),
    )
    op.create_index(
        op.f("ix_handyman_documents_handyman_id"),
        "handyman_documents",
        ["handyman_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_handyman_documents_handyman_id"),
        table_name="handyman_documents",
    )
    op.drop_table("handyman_documents")
    document_type.drop(op.get_bind(), checkfirst=True)

    for column in ("longitude", "latitude", "zip", "state", "city", "street_address"):
        op.drop_column("handymen", column)

"""Add private Lead photo metadata.

Revision ID: e9a6b1c4d804
Revises: d8f5a0b3c703
"""

import sqlalchemy as sa

from alembic import op

revision = "e9a6b1c4d804"
down_revision = "d8f5a0b3c703"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "lead_attachments",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "lead_id", sa.Uuid(), sa.ForeignKey("leads.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("storage_key", sa.String(512), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("uploaded_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("uploaded_by_name", sa.String(255), nullable=False),
        sa.UniqueConstraint("storage_key", name="uq_lead_attachments_storage_key"),
    )
    op.create_index("ix_lead_attachments_lead_id", "lead_attachments", ["lead_id"])


def downgrade() -> None:
    # Remove private objects through the API before downgrading this feature.
    op.drop_index("ix_lead_attachments_lead_id", table_name="lead_attachments")
    op.drop_table("lead_attachments")

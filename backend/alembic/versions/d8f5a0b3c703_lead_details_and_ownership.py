"""Add approximate lead details and dispatcher ownership.

Revision ID: d8f5a0b3c703
Revises: c7e4f9a2b602
"""

import sqlalchemy as sa

from alembic import op

revision = "d8f5a0b3c703"
down_revision = "c7e4f9a2b602"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Legacy leads remain valid; do not invent location, ownership or event times.
    op.add_column("leads", sa.Column("state", sa.String(2), nullable=True))
    op.add_column("leads", sa.Column("property_type", sa.String(32), nullable=True))
    op.add_column("leads", sa.Column("job_summary", sa.String(500), nullable=True))
    op.add_column("leads", sa.Column("assigned_dispatcher_id", sa.Uuid(), nullable=True))
    op.add_column("leads", sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        "fk_leads_assigned_dispatcher_id_users",
        "leads",
        "users",
        ["assigned_dispatcher_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_leads_assigned_dispatcher_id", "leads", ["assigned_dispatcher_id"])


def downgrade() -> None:
    op.drop_index("ix_leads_assigned_dispatcher_id", table_name="leads")
    op.drop_constraint("fk_leads_assigned_dispatcher_id_users", "leads", type_="foreignkey")
    for name in ("assigned_at", "assigned_dispatcher_id", "job_summary", "property_type", "state"):
        op.drop_column("leads", name)

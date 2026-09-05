"""add task financials and handyman payout snapshots

Revision ID: a9f6c2d1e4b7
Revises: d7e4b31a0f62
Create Date: 2026-09-03 08:30:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a9f6c2d1e4b7"
down_revision: str | None = "d7e4b31a0f62"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


materials_paid_by = postgresql.ENUM(
    "company",
    "handyman",
    "customer",
    name="materials_paid_by",
    create_type=False,
)


def upgrade() -> None:
    op.add_column(
        "handymen",
        sa.Column(
            "default_payout_percent",
            sa.Numeric(precision=5, scale=2),
            server_default=sa.text("60.00"),
            nullable=False,
        ),
    )

    # tasks.price is intentionally retained as an untouched legacy field until
    # a separate data audit establishes the meaning of any historical values.
    # New financial data starts at 0.00 and never copies from tasks.price.
    op.add_column(
        "tasks",
        sa.Column(
            "labor_price",
            sa.Numeric(precision=10, scale=2),
            server_default=sa.text("0.00"),
            nullable=False,
        ),
    )

    op.add_column(
        "tasks",
        sa.Column(
            "materials_cost",
            sa.Numeric(precision=10, scale=2),
            server_default=sa.text("0.00"),
            nullable=False,
        ),
    )
    materials_paid_by.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "tasks",
        sa.Column(
            "materials_paid_by",
            materials_paid_by,
            server_default=sa.text("'company'"),
            nullable=False,
        ),
    )
    op.add_column(
        "tasks",
        sa.Column(
            "handyman_payout_percent",
            sa.Numeric(precision=5, scale=2),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("tasks", "handyman_payout_percent")
    op.drop_column("tasks", "materials_paid_by")
    materials_paid_by.drop(op.get_bind(), checkfirst=True)
    op.drop_column("tasks", "materials_cost")
    op.drop_column("tasks", "labor_price")
    op.drop_column("handymen", "default_payout_percent")

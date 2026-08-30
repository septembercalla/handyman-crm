"""promote and rename the primary administrator

Revision ID: 8f4b2c1a7d90
Revises: 20bd54d849de
Create Date: 2026-08-30 20:15:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "8f4b2c1a7d90"
down_revision: str | None = "20bd54d849de"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("auth_version", sa.Integer(), server_default="0", nullable=False),
    )
    # Preserve the account id, password and timestamps. Only normalize the
    # legacy seeded identity, and only replace the known placeholder name.
    op.execute(
        sa.text(
            """
            UPDATE users
            SET role = 'admin',
                full_name = CASE
                    WHEN full_name = 'Alex Dispatcher' THEN 'CRM Administrator'
                    ELSE full_name
                END
            WHERE lower(email) = 'dispatcher@handyman.crm'
            """
        )
    )


def downgrade() -> None:
    # Identity/role changes may be edited after deploy and must not be guessed
    # or silently reverted by a schema rollback.
    op.drop_column("users", "auth_version")

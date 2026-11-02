"""Mobile sessions, technician links and optimistic task revisions.

Revision ID: fa0711b2c901
Revises: e9a6b1c4d804
"""

import sqlalchemy as sa

from alembic import op

revision = "fa0711b2c901"
down_revision = "e9a6b1c4d804"
branch_labels = None
depends_on = None


def upgrade():
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'technician'")
    op.add_column("users", sa.Column("handyman_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_users_handyman_id", "users", "handymen", ["handyman_id"], ["id"], ondelete="RESTRICT"
    )
    op.create_unique_constraint("uq_users_handyman_id", "users", ["handyman_id"])
    op.add_column("tasks", sa.Column("revision", sa.Integer(), server_default="1", nullable=False))
    op.create_table(
        "mobile_sessions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("refresh_hash", sa.String(64), unique=True, nullable=False),
        sa.Column("auth_version", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_mobile_sessions_user_id", "mobile_sessions", ["user_id"])


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM users WHERE role = 'technician'")):
        raise RuntimeError("Remove technician accounts explicitly before downgrade")
    op.drop_table("mobile_sessions")
    op.drop_column("tasks", "revision")
    op.drop_constraint("uq_users_handyman_id", "users", type_="unique")
    op.drop_constraint("fk_users_handyman_id", "users", type_="foreignkey")
    op.drop_column("users", "handyman_id")
    # PostgreSQL enum label intentionally retained; removing it needs a separate audit.

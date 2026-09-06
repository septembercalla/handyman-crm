"""Add operational leads, activity history and task review tracking.

Revision ID: b6d3e8f2a901
Revises: a9f6c2d1e4b7
"""

import sqlalchemy as sa

from alembic import op

revision = "b6d3e8f2a901"
down_revision = "a9f6c2d1e4b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Serialize initialization against existing task writers; preserve every task number.
    op.execute("LOCK TABLE tasks IN SHARE ROW EXCLUSIVE MODE")
    op.create_table(
        "task_number_counter",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("last_value", sa.BigInteger(), nullable=False),
    )
    op.execute(
        "INSERT INTO task_number_counter (id, last_value) "
        "SELECT 1, GREATEST(1000, COALESCE("
        "MAX(CAST(substring(task_number from '[0-9]+$') AS BIGINT)), 1000)) FROM tasks"
    )
    op.add_column(
        "tasks",
        sa.Column("review_status", sa.String(32), nullable=False, server_default="not_requested"),
    )
    op.add_column("tasks", sa.Column("review_requested_at", sa.DateTime(timezone=True)))
    op.add_column("tasks", sa.Column("review_received_at", sa.DateTime(timezone=True)))
    op.add_column("tasks", sa.Column("review_rating", sa.Integer()))
    op.add_column("tasks", sa.Column("review_platform", sa.String(32)))
    op.execute("UPDATE tasks SET review_status = 'skipped' WHERE status = 'done'")
    op.create_index("ix_tasks_review_status", "tasks", ["review_status"])
    op.create_table(
        "leads",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("external_reference", sa.String(255)),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(64), nullable=False),
        sa.Column("email", sa.String(255)),
        sa.Column("service_requested", sa.String(255)),
        sa.Column("address", sa.String(512)),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("stage", sa.String(32), nullable=False),
        sa.Column("latest_contact_outcome", sa.String(32)),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("first_contacted_at", sa.DateTime(timezone=True)),
        sa.Column("last_contacted_at", sa.DateTime(timezone=True)),
        sa.Column("next_follow_up_at", sa.DateTime(timezone=True)),
        sa.Column("booked_at", sa.DateTime(timezone=True)),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("contact_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "converted_customer_id", sa.Uuid(), sa.ForeignKey("customers.id", ondelete="SET NULL")
        ),
        sa.Column(
            "converted_task_id",
            sa.Uuid(),
            sa.ForeignKey("tasks.id", ondelete="SET NULL"),
            unique=True,
        ),
        sa.Column("lost_reason", sa.Text()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    for column in (
        "source",
        "stage",
        "received_at",
        "next_follow_up_at",
        "booked_at",
        "converted_customer_id",
    ):
        op.create_index(f"ix_leads_{column}", "leads", [column])
    op.create_table(
        "lead_activities",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column(
            "lead_id", sa.Uuid(), sa.ForeignKey("leads.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("event_type", sa.String(32), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("user_name", sa.String(255), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.UniqueConstraint("lead_id", "sequence", name="uq_lead_activity_sequence"),
    )
    op.create_index("ix_lead_activities_lead_id", "lead_activities", ["lead_id"])
    op.create_index("ix_lead_activities_timestamp", "lead_activities", ["timestamp"])


def downgrade() -> None:
    op.drop_table("task_number_counter")
    op.drop_table("lead_activities")
    op.drop_table("leads")
    op.drop_index("ix_tasks_review_status", table_name="tasks")
    for column in (
        "review_platform",
        "review_rating",
        "review_received_at",
        "review_requested_at",
        "review_status",
    ):
        op.drop_column("tasks", column)

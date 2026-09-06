"""Adapt existing leads to the NovaFix inquiry/contact/quote workflow.

Revision ID: c7e4f9a2b602
Revises: b6d3e8f2a901
"""

import sqlalchemy as sa

from alembic import op

revision = "c7e4f9a2b602"
down_revision = "b6d3e8f2a901"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for name, kind in (
        ("city", sa.String(128)),
        ("zip_code", sa.String(16)),
        ("original_request", sa.Text()),
        ("source_lead_id", sa.String(255)),
        ("source_url", sa.String(2048)),
        ("lead_cost", sa.Numeric(12, 2)),
        ("next_action", sa.String(32)),
        ("last_contact_method", sa.String(32)),
        ("qualified_at", sa.DateTime(timezone=True)),
        ("quoted_min", sa.Numeric(12, 2)),
        ("quoted_max", sa.Numeric(12, 2)),
        ("quoted_fixed_price", sa.Numeric(12, 2)),
        ("materials_included", sa.Boolean()),
        ("quote_sent_at", sa.DateTime(timezone=True)),
        ("lost_at", sa.DateTime(timezone=True)),
        ("lost_note", sa.Text()),
        ("refund_status", sa.String(32)),
    ):
        op.add_column("leads", sa.Column(name, kind, nullable=True))
    op.add_column(
        "leads", sa.Column("quote_type", sa.String(32), nullable=False, server_default="not_quoted")
    )
    op.alter_column("leads", "phone", existing_type=sa.String(64), nullable=True)
    op.execute("UPDATE leads SET stage = 'contacting' WHERE stage = 'attempted'")
    op.execute("UPDATE leads SET stage = 'qualified' WHERE stage = 'contacted'")
    op.execute(
        "UPDATE leads SET source_lead_id = external_reference WHERE external_reference IS NOT NULL"
    )
    # Preserve legacy business outcomes verbatim; never rewrite existing activity records.
    op.execute("""
        UPDATE leads SET notes = COALESCE(notes, '') ||
            '\n[Legacy contact outcome: ' || latest_contact_outcome || ']'
        WHERE latest_contact_outcome IS NOT NULL AND latest_contact_outcome NOT IN
            ('answered', 'no_answer', 'voicemail', 'texted', 'call_back_later', 'wrong_number')
    """)
    op.execute("""
        UPDATE leads SET latest_contact_outcome = NULL
        WHERE latest_contact_outcome IS NOT NULL AND latest_contact_outcome NOT IN
            ('answered', 'no_answer', 'voicemail', 'texted', 'call_back_later', 'wrong_number')
    """)
    # Existing reasons were free text. Preserve the text and categorize it as Other.
    op.execute(
        "UPDATE leads SET lost_note = lost_reason, lost_reason = 'other' WHERE lost_reason IS NOT NULL"
    )
    op.execute("UPDATE leads SET next_action = 'no_action' WHERE stage IN ('booked', 'lost')")
    # Do not invent qualified_at/lost_at for historic events whose exact time is unknown.


def downgrade() -> None:
    op.execute("""
        UPDATE leads SET notes = COALESCE(notes, '') || '\n[Contact outcome: call_back_later]',
            latest_contact_outcome = 'other' WHERE latest_contact_outcome = 'call_back_later'
    """)
    op.execute("UPDATE leads SET stage = 'attempted' WHERE stage = 'contacting'")
    op.execute("UPDATE leads SET stage = 'contacted' WHERE stage = 'qualified'")
    op.execute("UPDATE leads SET lost_reason = lost_note WHERE lost_note IS NOT NULL")
    op.execute("UPDATE leads SET phone = '' WHERE phone IS NULL")
    op.alter_column("leads", "phone", existing_type=sa.String(64), nullable=False)
    for name in (
        "quote_type",
        "refund_status",
        "lost_note",
        "lost_at",
        "quote_sent_at",
        "materials_included",
        "quoted_fixed_price",
        "quoted_max",
        "quoted_min",
        "qualified_at",
        "last_contact_method",
        "next_action",
        "lead_cost",
        "source_url",
        "source_lead_id",
        "original_request",
        "zip_code",
        "city",
    ):
        op.drop_column("leads", name)

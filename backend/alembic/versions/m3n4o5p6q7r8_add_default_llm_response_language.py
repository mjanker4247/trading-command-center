"""add default_llm_response_language to users

Revision ID: m3n4o5p6q7r8
Revises: l2m3n4o5p6q7
Create Date: 2026-07-07
"""
from alembic import op
import sqlalchemy as sa

revision = "m3n4o5p6q7r8"
down_revision = "l2m3n4o5p6q7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "default_llm_response_language",
            sa.String(16),
            nullable=False,
            server_default="en-US",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "default_llm_response_language")

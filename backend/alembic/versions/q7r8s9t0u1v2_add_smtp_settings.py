"""add smtp settings columns

Revision ID: q7r8s9t0u1v2
Revises: p6q7r8s9t0u1
Create Date: 2026-11-10
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "q7r8s9t0u1v2"
down_revision: Union[str, Sequence[str], None] = "p6q7r8s9t0u1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("settings", sa.Column("smtp_host", sa.String(255), server_default="", nullable=False))
    op.add_column("settings", sa.Column("smtp_port", sa.Integer(), server_default="25", nullable=False))
    op.add_column("settings", sa.Column("smtp_user", sa.String(255), server_default="", nullable=False))
    op.add_column("settings", sa.Column("smtp_password_encrypted", sa.Text(), nullable=True))
    op.add_column(
        "settings",
        sa.Column("smtp_from", sa.String(255), server_default="noreply@agentfloor.local", nullable=False),
    )
    op.add_column(
        "settings",
        sa.Column("smtp_start_tls", sa.Boolean(), server_default="false", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("settings", "smtp_start_tls")
    op.drop_column("settings", "smtp_from")
    op.drop_column("settings", "smtp_password_encrypted")
    op.drop_column("settings", "smtp_user")
    op.drop_column("settings", "smtp_port")
    op.drop_column("settings", "smtp_host")

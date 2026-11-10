"""add news_provider_configs table

Revision ID: q7r8s9t0u1v2
Revises: p6q7r8s9t0u1
Create Date: 2026-11-10
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "q7r8s9t0u1v2"
down_revision: Union[str, Sequence[str], None] = "p6q7r8s9t0u1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "news_provider_configs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("provider_id", sa.String(length=64), nullable=False),
        sa.Column("display_name", sa.String(length=128), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("priority", sa.Integer(), server_default="100", nullable=False),
        sa.Column("article_limit", sa.Integer(), server_default="20", nullable=False),
        sa.Column("endpoint_url", sa.String(length=1024), nullable=True),
        sa.Column("api_key_provider", sa.String(length=64), nullable=True),
        sa.Column("auth_header_name", sa.String(length=64), nullable=True),
        sa.Column("extra", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider_id", name="uq_news_provider_configs_provider_id"),
    )
    op.create_index(
        op.f("ix_news_provider_configs_provider_id"),
        "news_provider_configs",
        ["provider_id"],
        unique=False,
    )

    news_provider_configs = sa.table(
        "news_provider_configs",
        sa.column("id", sa.Uuid()),
        sa.column("provider_id", sa.String()),
        sa.column("display_name", sa.String()),
        sa.column("kind", sa.String()),
        sa.column("is_enabled", sa.Boolean()),
        sa.column("priority", sa.Integer()),
        sa.column("article_limit", sa.Integer()),
        sa.column("api_key_provider", sa.String()),
        sa.column("extra", postgresql.JSONB()),
    )
    op.bulk_insert(
        news_provider_configs,
        [
            {
                "id": "11111111-1111-1111-1111-111111111101",
                "provider_id": "finnhub",
                "display_name": "Finnhub",
                "kind": "builtin",
                "is_enabled": True,
                "priority": 10,
                "article_limit": 20,
                "api_key_provider": "finnhub",
                "extra": {"ui_visible": True},
            },
            {
                "id": "11111111-1111-1111-1111-111111111102",
                "provider_id": "yfinance",
                "display_name": "Yahoo Finance",
                "kind": "builtin",
                "is_enabled": False,
                "priority": 50,
                "article_limit": 20,
                "api_key_provider": None,
                "extra": {"ui_visible": False},
            },
            {
                "id": "11111111-1111-1111-1111-111111111103",
                "provider_id": "alpha_vantage",
                "display_name": "Alpha Vantage",
                "kind": "builtin",
                "is_enabled": False,
                "priority": 60,
                "article_limit": 20,
                "api_key_provider": "alpha_vantage",
                "extra": {"ui_visible": False},
            },
        ],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_news_provider_configs_provider_id"), table_name="news_provider_configs")
    op.drop_table("news_provider_configs")

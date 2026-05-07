"""add portfolio insights table

Revision ID: b1c2d3e4f5a6
Revises: fe62d2d5f7b6
Create Date: 2026-05-07 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, Sequence[str], None] = 'fe62d2d5f7b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'portfolio_insights',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('portfolio_id', sa.Uuid(), nullable=False),
        sa.Column('generated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('status', sa.Enum('pending', 'running', 'completed', 'failed', name='insightstatus'), nullable=False),
        sa.Column('trigger', sa.Enum('scheduled', 'manual', name='insighttrigger'), nullable=False),
        sa.Column('llm_provider', sa.String(), nullable=False),
        sa.Column('llm_model', sa.String(), nullable=False),
        sa.Column('health_score', sa.Integer(), nullable=True),
        sa.Column('overall_stance', sa.Enum('bullish', 'bearish', 'neutral', 'mixed', name='insightstance'), nullable=True),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('action_items', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('risk_alerts', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('sector_analysis', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('strengths', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('weaknesses', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('holdings_snapshot', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['portfolio_id'], ['portfolios.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_portfolio_insights_portfolio_id', 'portfolio_insights', ['portfolio_id'])
    op.create_index('ix_portfolio_insights_generated_at', 'portfolio_insights', ['generated_at'])


def downgrade() -> None:
    op.drop_index('ix_portfolio_insights_generated_at', table_name='portfolio_insights')
    op.drop_index('ix_portfolio_insights_portfolio_id', table_name='portfolio_insights')
    op.drop_table('portfolio_insights')
    op.execute("DROP TYPE IF EXISTS insightstatus")
    op.execute("DROP TYPE IF EXISTS insighttrigger")
    op.execute("DROP TYPE IF EXISTS insightstance")

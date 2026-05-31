"""add response language to runs and watchlist items

Revision ID: c2d3e4f5a6b7
Revises: b4c1d2e3f456
Create Date: 2026-05-31 14:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c2d3e4f5a6b7'
down_revision: Union[str, Sequence[str], None] = 'b4c1d2e3f456'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'runs',
        sa.Column('response_language', sa.String(length=16), nullable=False, server_default='en-US'),
    )
    op.add_column(
        'watchlist_items',
        sa.Column('response_language', sa.String(length=16), nullable=False, server_default='en-US'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('watchlist_items', 'response_language')
    op.drop_column('runs', 'response_language')

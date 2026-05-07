"""add last_run_id to watchlist_items

Revision ID: f3a1b2c4d5e6
Revises: 766b89c83214
Create Date: 2026-05-07 17:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f3a1b2c4d5e6'
down_revision: Union[str, Sequence[str], None] = '766b89c83214'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('watchlist_items',
        sa.Column('last_run_id', sa.Uuid(), nullable=True)
    )
    op.create_foreign_key(
        'fk_watchlist_items_last_run_id',
        'watchlist_items', 'runs',
        ['last_run_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_watchlist_items_last_run_id', 'watchlist_items', type_='foreignkey')
    op.drop_column('watchlist_items', 'last_run_id')

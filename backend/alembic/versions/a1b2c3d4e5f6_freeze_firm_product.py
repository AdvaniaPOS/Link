"""Freeze firm products against catalog drift (frozen_at column).

Revision ID: a1b2c3d4e5f6
Revises: 9d4e2c1a7b50
Create Date: 2026-04-28
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "9d4e2c1a7b50"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("firm_products") as batch:
        batch.add_column(sa.Column("frozen_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("firm_products") as batch:
        batch.drop_column("frozen_at")

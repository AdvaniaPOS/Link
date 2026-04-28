"""Add owner_firm_id to product_catalog (firm-private products).

Revision ID: 7b3a1f8c4e2d
Revises:
Create Date: 2026-04-28

Note: down_revision intentionally None. The model schema is bootstrapped via
SQLAlchemy ``Base.metadata.create_all`` on first run; this file only carries
incremental changes for already-deployed databases.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "7b3a1f8c4e2d"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("product_catalog") as batch_op:
        batch_op.add_column(sa.Column("owner_firm_id", sa.CHAR(32), nullable=True))
        batch_op.create_foreign_key(
            "fk_product_catalog_owner_firm_id_firms",
            "firms",
            ["owner_firm_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_index(
            "ix_product_catalog_owner_firm_id", ["owner_firm_id"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("product_catalog") as batch_op:
        batch_op.drop_index("ix_product_catalog_owner_firm_id")
        batch_op.drop_constraint(
            "fk_product_catalog_owner_firm_id_firms", type_="foreignkey"
        )
        batch_op.drop_column("owner_firm_id")

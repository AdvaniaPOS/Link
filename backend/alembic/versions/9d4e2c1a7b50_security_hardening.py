"""Security hardening: user lockout, password_changed_at, totp, reset tokens, audit log.

Revision ID: 9d4e2c1a7b50
Revises: 7b3a1f8c4e2d
Create Date: 2026-04-28
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "9d4e2c1a7b50"
down_revision = "7b3a1f8c4e2d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ----- users: new security columns -----
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "failed_login_attempts",
                sa.Integer(),
                nullable=False,
                server_default="0",
            )
        )
        batch_op.add_column(sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("totp_secret", sa.String(length=64), nullable=True))
        batch_op.add_column(
            sa.Column(
                "totp_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )

    # ----- password_reset_tokens -----
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.CHAR(32), primary_key=True),
        sa.Column("user_id", sa.CHAR(32), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE",
            name="fk_password_reset_tokens_user_id_users",
        ),
        sa.UniqueConstraint("token_hash", name="uq_password_reset_tokens_token_hash"),
    )
    op.create_index(
        "ix_password_reset_tokens_user_id", "password_reset_tokens", ["user_id"], unique=False
    )
    op.create_index(
        "ix_password_reset_tokens_token_hash",
        "password_reset_tokens",
        ["token_hash"],
        unique=False,
    )

    # ----- audit_logs -----
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.CHAR(32), primary_key=True),
        sa.Column("actor_user_id", sa.CHAR(32), nullable=True),
        sa.Column("actor_email", sa.String(length=255), nullable=True),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("target_type", sa.String(length=80), nullable=True),
        sa.Column("target_id", sa.String(length=80), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.Column("extra", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["actor_user_id"], ["users.id"], ondelete="SET NULL",
            name="fk_audit_logs_actor_user_id_users",
        ),
    )
    op.create_index("ix_audit_logs_actor_user_id", "audit_logs", ["actor_user_id"], unique=False)
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"], unique=False)
    op.create_index("ix_audit_logs_target_id", "audit_logs", ["target_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_audit_logs_target_id", table_name="audit_logs")
    op.drop_index("ix_audit_logs_action", table_name="audit_logs")
    op.drop_index("ix_audit_logs_actor_user_id", table_name="audit_logs")
    op.drop_table("audit_logs")

    op.drop_index("ix_password_reset_tokens_token_hash", table_name="password_reset_tokens")
    op.drop_index("ix_password_reset_tokens_user_id", table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")

    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("totp_enabled")
        batch_op.drop_column("totp_secret")
        batch_op.drop_column("last_login_at")
        batch_op.drop_column("locked_until")
        batch_op.drop_column("failed_login_attempts")
        batch_op.drop_column("password_changed_at")

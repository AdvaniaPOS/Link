"""Cross-dialect column types so the same models work on Postgres and SQLite (dev)."""

from sqlalchemy import Uuid

# `Uuid` (SQLAlchemy 2.0+) emits native UUID on Postgres and CHAR(32) on SQLite,
# while always exposing Python `uuid.UUID` to application code.
UUIDType = Uuid

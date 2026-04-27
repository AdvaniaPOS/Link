"""Add Discord webhook fields to firms + assets in dev SQLite DB.

Idempotent: skips columns that already exist.
"""

from sqlalchemy import text

from app.database import engine

FIRM_COLUMNS = [
    ("discord_enabled", "INTEGER NOT NULL DEFAULT 0"),
    ("discord_webhook_url", "VARCHAR(500)"),
]

ASSET_COLUMNS = [
    ("discord_webhook_url", "VARCHAR(500)"),
]


def _existing_columns(conn, table: str) -> set[str]:
    rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
    return {r[1] for r in rows}


def _add_missing(conn, table: str, columns: list[tuple[str, str]]) -> None:
    have = _existing_columns(conn, table)
    for name, ddl in columns:
        if name in have:
            print(f"  · {table}.{name} already exists")
            continue
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
        print(f"  + {table}.{name} added")


def main() -> None:
    with engine.begin() as conn:
        print("firms:")
        _add_missing(conn, "firms", FIRM_COLUMNS)
        print("assets:")
        _add_missing(conn, "assets", ASSET_COLUMNS)
    print("done.")


if __name__ == "__main__":
    main()

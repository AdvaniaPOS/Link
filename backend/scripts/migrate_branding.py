"""Add firm footer fields + product-catalog background fields to dev SQLite DB.

Idempotent: skips columns that already exist.
"""

from sqlalchemy import text

from app.database import engine

FIRM_COLUMNS = [
    ("footer_address", "VARCHAR(300)"),
    ("footer_phone", "VARCHAR(50)"),
    ("footer_email", "VARCHAR(255)"),
    ("footer_website", "VARCHAR(300)"),
]

CATALOG_COLUMNS = [
    ("background_url", "VARCHAR(500)"),
    ("background_kind", "VARCHAR(10) NOT NULL DEFAULT 'image'"),
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
        print("product_catalog:")
        _add_missing(conn, "product_catalog", CATALOG_COLUMNS)
    print("done.")


if __name__ == "__main__":
    main()

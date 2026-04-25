"""Add template/manual/warranty columns to product_models in SQLite dev DB."""
from sqlalchemy import text

from app.database import engine

NEW_COLS = [
    ("category", "VARCHAR(40) NOT NULL DEFAULT 'other'"),
    ("manual_url", "VARCHAR(500)"),
    ("quick_guide_url", "VARCHAR(500)"),
    ("warranty_url", "VARCHAR(500)"),
    ("warranty_text", "VARCHAR(4000)"),
]


def main() -> None:
    with engine.begin() as conn:
        existing = {r[1] for r in conn.execute(text("PRAGMA table_info(product_models)"))}
        print("Existing:", sorted(existing))
        for name, ddl in NEW_COLS:
            if name in existing:
                print(f"  - {name}: already present, skipping")
                continue
            conn.execute(text(f"ALTER TABLE product_models ADD COLUMN {name} {ddl}"))
            print(f"  + {name}: added")


if __name__ == "__main__":
    main()

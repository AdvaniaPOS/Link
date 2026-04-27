"""Add accessories + accessory_orders tables to SQLite dev DB."""

from sqlalchemy import text

from app.database import Base, engine

# Importing the models registers them with Base.metadata.
from app.models import accessory  # noqa: F401


def main() -> None:
    with engine.begin() as conn:
        existing = {
            r[0] for r in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
        }
        print("Existing tables:", sorted(existing))
    # create_all is additive - leaves existing tables alone, creates only new ones.
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        after = {
            r[0] for r in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
        }
        for t in sorted(after - existing):
            print(f"  + created table: {t}")
        if not (after - existing):
            print("  (no new tables - already up to date)")


if __name__ == "__main__":
    main()

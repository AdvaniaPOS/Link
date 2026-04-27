"""Add contact_preference column to tickets in SQLite dev DB."""

from sqlalchemy import text

from app.database import engine


def main() -> None:
    with engine.begin() as conn:
        cols = [r[1] for r in conn.execute(text("PRAGMA table_info(tickets)"))]
        print("Existing columns:", cols)
        if "contact_preference" in cols:
            print("Already migrated.")
            return
        conn.execute(
            text(
                "ALTER TABLE tickets ADD COLUMN contact_preference VARCHAR(16) "
                "NOT NULL DEFAULT 'email'"
            )
        )
        print("Added contact_preference column.")


if __name__ == "__main__":
    main()

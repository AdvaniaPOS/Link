from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

settings = get_settings()

# SQLite needs check_same_thread=False because FastAPI uses multiple threads.
connect_args: dict = {}
_is_sqlite = settings.database_url.startswith("sqlite")
if _is_sqlite:
    connect_args["check_same_thread"] = False

engine = create_engine(
    settings.database_url, pool_pre_ping=True, future=True, connect_args=connect_args
)


# Apply per-connection PRAGMAs for SQLite to make local/dev usage robust:
# - WAL: concurrent readers + a single writer (no more "database is locked" on
#   every reload during dev when both uvicorn and a script touch the DB).
# - foreign_keys=ON: SQLite ignores FKs unless you turn this on every connection.
# - busy_timeout: wait up to 5s for a writer instead of failing immediately.
if _is_sqlite:

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _connection_record):  # type: ignore[no-untyped-def]
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA busy_timeout=5000")
        finally:
            cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

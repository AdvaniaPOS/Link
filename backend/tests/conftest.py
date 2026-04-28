"""Pytest fixtures shared by the test suite.

The fixtures spin up an isolated SQLite database for each test session so
the tests never touch a developer's local ``tagly.db``.
"""

from __future__ import annotations

import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

import pytest

# Configure environment BEFORE importing the app so Settings picks up the
# test database.
_TEST_DB = Path(tempfile.gettempdir()) / "tagly_test.db"
if _TEST_DB.exists():
    _TEST_DB.unlink()

os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TEST_DB.as_posix()}")
os.environ.setdefault("CELERY_EAGER", "true")
os.environ.setdefault("CELERY_BROKER_URL", "memory://")
os.environ.setdefault("CELERY_RESULT_BACKEND", "cache+memory://")
os.environ.setdefault("RESEND_API_KEY", "re_test_key")
os.environ.setdefault("ADMIN_TOKEN", "test-admin-token")
os.environ.setdefault("LOG_LEVEL", "WARNING")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _create_schema() -> Iterator[None]:
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)

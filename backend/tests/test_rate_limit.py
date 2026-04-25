"""Verify slowapi actually limits when enabled."""

from __future__ import annotations

import importlib

from fastapi.testclient import TestClient


def test_login_is_rate_limited(monkeypatch) -> None:
    # Re-import the app with rate limiting enabled and a tiny limit.
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "true")
    monkeypatch.setenv("RATE_LIMIT_LOGIN", "3/minute")

    # Clear cached settings + drop modules that captured the old limiter.
    import app.config as cfg

    cfg.get_settings.cache_clear()

    for mod_name in [
        "app.rate_limit",
        "app.api.auth",
        "app.api.public",
        "app.main",
    ]:
        if mod_name in list(importlib.sys.modules):
            del importlib.sys.modules[mod_name]

    from app.main import app  # type: ignore

    client = TestClient(app)
    statuses = [
        client.post(
            "/api/auth/login",
            data={"username": "nope@example.com", "password": "wrong"},
        ).status_code
        for _ in range(6)
    ]
    # First 3 attempts should be processed (and return 401), then 429.
    assert 401 in statuses
    assert 429 in statuses, f"Expected 429 in {statuses}"

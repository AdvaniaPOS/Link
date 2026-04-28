"""Smoke tests for the new security features."""

from __future__ import annotations

import uuid

import pyotp
import pytest
from sqlalchemy.orm import Session

from app.auth import hash_password
from app.database import SessionLocal
from app.models import User
from app.models.user import UserRole


def _mk_user(db: Session, email: str, password: str) -> User:
    u = User(
        email=email,
        password_hash=hash_password(password),
        full_name="Test",
        role=UserRole.firm_admin,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture()
def db() -> Session:
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


def _login(client, email: str, password: str, totp: str | None = None):
    form = {"username": email, "password": password}
    if totp:
        form["client_id"] = totp
    return client.post("/api/auth/login", data=form)


def test_change_password_invalidates_old_token(client, db):
    email = f"user-{uuid.uuid4().hex[:8]}@example.com"
    _mk_user(db, email, "OriginalPass123!")
    r = _login(client, email, "OriginalPass123!")
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    r = client.get("/api/auth/me", headers=headers)
    assert r.status_code == 200

    r = client.post(
        "/api/auth/change-password",
        json={"current_password": "OriginalPass123!", "new_password": "Brand-new-pw-9!"},
        headers=headers,
    )
    assert r.status_code == 204, r.text

    # Old token should now be rejected because password_changed_at > iat.
    r = client.get("/api/auth/me", headers=headers)
    assert r.status_code == 401


def test_account_lockout_after_repeated_failures(client, db):
    email = f"lock-{uuid.uuid4().hex[:8]}@example.com"
    _mk_user(db, email, "GoodPassword1!")

    # 7 wrong attempts (LOCKOUT_MAX_ATTEMPTS default = 7).
    for _ in range(7):
        r = _login(client, email, "Wrong-Password-9!")
        assert r.status_code == 401

    # Now the account is locked even with the correct password.
    r = _login(client, email, "GoodPassword1!")
    assert r.status_code == 423


def test_totp_setup_and_login(client, db):
    email = f"totp-{uuid.uuid4().hex[:8]}@example.com"
    _mk_user(db, email, "TotpPassword1!")
    r = _login(client, email, "TotpPassword1!")
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    r = client.post("/api/auth/2fa/setup", headers=headers)
    assert r.status_code == 200
    secret = r.json()["secret"]
    assert "otpauth://" in r.json()["otpauth_url"]

    code = pyotp.TOTP(secret).now()
    r = client.post("/api/auth/2fa/verify", json={"code": code}, headers=headers)
    assert r.status_code == 204

    # Login without code now fails with 401 + X-Require-2FA.
    r = _login(client, email, "TotpPassword1!")
    assert r.status_code == 401
    assert r.headers.get("x-require-2fa") == "true"

    # Login with the right code succeeds.
    r = _login(client, email, "TotpPassword1!", totp=pyotp.TOTP(secret).now())
    assert r.status_code == 200


def test_forgot_password_always_204(client):
    r = client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    assert r.status_code == 204

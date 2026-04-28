from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.audit import log_audit
from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.config import get_settings
from app.database import get_db
from app.models import PasswordResetToken, User
from app.rate_limit import limiter
from app.schemas import (
    ChangePasswordIn,
    ForgotPasswordIn,
    MeFirmOut,
    ResetPasswordIn,
    TokenOut,
    TotpDisableIn,
    TotpSetupOut,
    TotpVerifyIn,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _now() -> datetime:
    return datetime.now(UTC)


def _is_locked(user: User) -> bool:
    if user.locked_until is None:
        return False
    lu = user.locked_until
    if lu.tzinfo is None:
        lu = lu.replace(tzinfo=UTC)
    return lu > _now()


def _register_failed_login(db: Session, user: User, request: Request) -> None:
    settings = get_settings()
    user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
    if user.failed_login_attempts >= settings.lockout_max_attempts:
        user.locked_until = _now() + timedelta(minutes=settings.lockout_minutes)
        log_audit(
            db,
            actor_email=user.email,
            action="auth.account_locked",
            target_type="user",
            target_id=user.id,
            request=request,
            extra={"attempts": user.failed_login_attempts},
        )
    db.add(user)
    db.commit()


def _reset_lockout(user: User) -> None:
    user.failed_login_attempts = 0
    user.locked_until = None


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# ---------- login + me ----------


@router.post("/login", response_model=TokenOut)
@limiter.limit(lambda: get_settings().rate_limit_login)
def login(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> TokenOut:
    """Login with email + password.

    If the account has TOTP enabled, the form's ``client_id`` field carries the
    6-digit code (OAuth2PasswordRequestForm has no native 2FA field).
    """
    email = form.username.lower().strip()
    user = db.query(User).filter(User.email == email).first()

    invalid = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    locked = HTTPException(
        status_code=status.HTTP_423_LOCKED,
        detail="Konto er midlertidig låst. Prøv igjen senere.",
    )

    if user is None or not user.is_active:
        log_audit(
            db,
            actor_email=email,
            action="auth.login_failed",
            request=request,
            extra={"reason": "unknown_or_inactive"},
            commit=True,
        )
        raise invalid

    if _is_locked(user):
        raise locked

    if not verify_password(form.password, user.password_hash):
        _register_failed_login(db, user, request)
        log_audit(
            db,
            actor_email=user.email,
            action="auth.login_failed",
            target_type="user",
            target_id=user.id,
            request=request,
            extra={"reason": "bad_password"},
            commit=True,
        )
        raise invalid

    if user.totp_enabled:
        code = (form.client_id or "").strip()
        if not code:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="2FA-kode kreves.",
                headers={"X-Require-2FA": "true"},
            )
        if not user.totp_secret or not pyotp.TOTP(user.totp_secret).verify(code, valid_window=1):
            _register_failed_login(db, user, request)
            log_audit(
                db,
                actor_email=user.email,
                action="auth.login_failed",
                target_type="user",
                target_id=user.id,
                request=request,
                extra={"reason": "bad_totp"},
                commit=True,
            )
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Feil 2FA-kode.")

    _reset_lockout(user)
    user.last_login_at = _now()
    db.add(user)
    log_audit(
        db,
        actor=user,
        action="auth.login_succeeded",
        target_type="user",
        target_id=user.id,
        request=request,
    )
    db.commit()
    return TokenOut(access_token=create_access_token(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.get("/me/firms", response_model=list[MeFirmOut])
def me_firms_endpoint(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[MeFirmOut]:
    """Firms the current user can switch into."""
    from app.api.memberships import me_firms

    return me_firms(db, user)


# ---------- change password (authenticated) ----------


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(lambda: get_settings().rate_limit_login)
def change_password(
    request: Request,
    body: ChangePasswordIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nåværende passord er feil.",
        )
    if verify_password(body.new_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Det nye passordet må være forskjellig fra det nåværende.",
        )
    user.password_hash = hash_password(body.new_password)
    # +1s ensures any token issued in the same second is invalidated.
    user.password_changed_at = _now() + timedelta(seconds=1)
    db.add(user)
    log_audit(
        db,
        actor=user,
        action="auth.password_changed",
        target_type="user",
        target_id=user.id,
        request=request,
    )
    db.commit()


# ---------- forgot / reset password ----------


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(lambda: get_settings().rate_limit_login)
def forgot_password(
    request: Request,
    body: ForgotPasswordIn,
    db: Session = Depends(get_db),
) -> None:
    """Issue a password-reset token and email it to the user.

    Always returns 204 to avoid revealing whether an account exists.
    """
    settings = get_settings()
    email = body.email.lower().strip()
    user = db.query(User).filter(User.email == email, User.is_active.is_(True)).first()

    log_audit(
        db,
        actor_email=email,
        action="auth.password_reset_requested",
        target_type="user",
        target_id=user.id if user else None,
        request=request,
        commit=True,
    )

    if user is None:
        return None

    raw = secrets.token_urlsafe(48)
    token_hash = _hash_token(raw)
    db.add(
        PasswordResetToken(
            id=uuid4(),
            user_id=user.id,
            token_hash=token_hash,
            expires_at=_now() + timedelta(minutes=settings.password_reset_minutes),
            created_at=_now(),
        )
    )
    db.commit()

    try:
        from app.workers.tasks import send_password_reset_email

        link = f"{settings.public_base_url.rstrip('/')}/admin/reset-password?token={raw}"
        send_password_reset_email.delay(
            to_email=user.email, full_name=user.full_name or "", reset_link=link
        )
    except Exception:  # noqa: BLE001
        pass
    return None


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(lambda: get_settings().rate_limit_login)
def reset_password(
    request: Request,
    body: ResetPasswordIn,
    db: Session = Depends(get_db),
) -> None:
    token_hash = _hash_token(body.token)
    record = (
        db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == token_hash).first()
    )
    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Tokenet er ugyldig eller utløpt.",
    )
    if record is None or record.used_at is not None:
        raise invalid
    exp = record.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=UTC)
    if exp < _now():
        raise invalid
    user = db.query(User).filter(User.id == record.user_id).first()
    if user is None or not user.is_active:
        raise invalid

    user.password_hash = hash_password(body.new_password)
    user.password_changed_at = _now() + timedelta(seconds=1)
    _reset_lockout(user)
    record.used_at = _now()
    (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.id != record.id,
        )
        .update({PasswordResetToken.used_at: _now()})
    )
    db.add(user)
    db.add(record)
    log_audit(
        db,
        actor=user,
        action="auth.password_reset_completed",
        target_type="user",
        target_id=user.id,
        request=request,
    )
    db.commit()


# ---------- TOTP 2FA ----------


@router.post("/2fa/setup", response_model=TotpSetupOut)
def totp_setup(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TotpSetupOut:
    """Generate a fresh TOTP secret. The secret is stored immediately but
    ``totp_enabled`` stays False until the user verifies a code via /2fa/verify.
    """
    secret = pyotp.random_base32()
    user.totp_secret = secret
    user.totp_enabled = False
    db.add(user)
    db.commit()
    otpauth = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name="Tagly")
    return TotpSetupOut(secret=secret, otpauth_url=otpauth)


@router.post("/2fa/verify", status_code=status.HTTP_204_NO_CONTENT)
def totp_verify(
    request: Request,
    body: TotpVerifyIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    if not user.totp_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ingen 2FA satt opp.")
    if not pyotp.TOTP(user.totp_secret).verify(body.code, valid_window=1):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Feil kode.")
    user.totp_enabled = True
    db.add(user)
    log_audit(
        db,
        actor=user,
        action="auth.2fa_enabled",
        target_type="user",
        target_id=user.id,
        request=request,
    )
    db.commit()


@router.post("/2fa/disable", status_code=status.HTTP_204_NO_CONTENT)
def totp_disable(
    request: Request,
    body: TotpDisableIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    """Disable 2FA. Requires current password as a sanity-check re-auth."""
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nåværende passord er feil.",
        )
    user.totp_enabled = False
    user.totp_secret = None
    db.add(user)
    log_audit(
        db,
        actor=user,
        action="auth.2fa_disabled",
        target_type="user",
        target_id=user.id,
        request=request,
    )
    db.commit()

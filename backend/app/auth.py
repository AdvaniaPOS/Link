"""Password hashing + JWT issuance/verification + FastAPI auth dependencies."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models.user import User, UserRole

ALGORITHM = "HS256"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


# ---------- password ----------


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


# ---------- jwt ----------


def _secret() -> str:
    """JWT signing secret. Prefers JWT_SECRET, falls back to ADMIN_TOKEN."""
    return get_settings().effective_jwt_secret


def create_access_token(user: User) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role.value,
        "firm_id": str(user.firm_id) if user.firm_id else None,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.access_token_minutes)).timestamp()),
    }
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, _secret(), algorithms=[ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
        ) from exc


# ---------- dependencies ----------


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    data = decode_token(token)
    user = db.query(User).filter(User.id == UUID(data["sub"])).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_super_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super admin required")
    return user


def require_firm_access(firm_id: UUID, user: User) -> None:
    """Raise 403 unless the user is super_admin or scoped to the same firm."""
    if user.role == UserRole.super_admin:
        return
    if user.firm_id != firm_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

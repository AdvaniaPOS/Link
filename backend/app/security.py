import secrets

from fastapi import Header, HTTPException, status

from app.config import get_settings


def require_admin(x_admin_token: str = Header(..., alias="X-Admin-Token")) -> None:
    """Constant-time check of the admin bearer token."""
    expected = get_settings().admin_token
    if not secrets.compare_digest(x_admin_token, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin token")

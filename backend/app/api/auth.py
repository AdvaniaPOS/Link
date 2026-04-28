from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.auth import create_access_token, get_current_user, verify_password
from app.config import get_settings
from app.database import get_db
from app.models import User
from app.rate_limit import limiter
from app.schemas import MeFirmOut, TokenOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
@limiter.limit(lambda: get_settings().rate_limit_login)
def login(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> TokenOut:
    # OAuth2PasswordRequestForm uses `username` field; treat as email.
    user = db.query(User).filter(User.email == form.username.lower()).first()
    if user is None or not user.is_active or not verify_password(form.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    return TokenOut(access_token=create_access_token(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.get("/me/firms", response_model=list[MeFirmOut])
def me_firms_endpoint(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[MeFirmOut]:
    """Firms the current user can switch into.

    Super-admins get every firm. Firm-admins get their primary firm plus any
    firms they have been granted membership in.
    """
    from app.api.memberships import me_firms

    return me_firms(db, user)

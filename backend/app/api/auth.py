from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.config import get_settings
from app.database import get_db
from app.models import User
from app.rate_limit import limiter
from app.schemas import ChangePasswordIn, MeFirmOut, TokenOut, UserOut

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


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(lambda: get_settings().rate_limit_login)
def change_password(
    request: Request,
    body: ChangePasswordIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    """Authenticated user changes their own password.

    Requires the current password (re-auth) and enforces a 10+ char minimum
    plus that the new password differs from the current one.
    """
    if not verify_password(body.current_password, user.password_hash):
        # Generic message; don't leak whether the account exists or not.
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
    db.add(user)
    db.commit()

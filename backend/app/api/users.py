"""User management. Super-admin can manage all users; firm_admin only own firm."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, hash_password
from app.database import get_db
from app.models import Firm, User, UserRole
from app.schemas import UserCreateIn, UserOut, UserUpdateIn

router = APIRouter(prefix="/admin/users", tags=["admin:users"])


def _ensure_can_manage(target: User, actor: User) -> None:
    if actor.role == UserRole.super_admin:
        return
    if target.firm_id is None or target.firm_id != actor.firm_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    if target.role == UserRole.super_admin:
        raise HTTPException(status_code=403, detail="Forbidden")


@router.get("", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> list[User]:
    q = db.query(User).order_by(User.created_at.desc())
    if actor.role != UserRole.super_admin:
        q = q.filter(User.firm_id == actor.firm_id)
    return q.all()


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateIn,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> User:
    role = UserRole(payload.role)

    if actor.role != UserRole.super_admin:
        if role == UserRole.super_admin:
            raise HTTPException(status_code=403, detail="Cannot create super admin")
        if payload.firm_id != actor.firm_id:
            raise HTTPException(status_code=403, detail="Cannot create user for another firm")

    if role == UserRole.firm_admin and payload.firm_id is None:
        raise HTTPException(status_code=400, detail="firm_id required for firm_admin")
    if role == UserRole.super_admin and payload.firm_id is not None:
        raise HTTPException(status_code=400, detail="super_admin must not have firm_id")

    if (
        payload.firm_id is not None
        and db.query(Firm).filter(Firm.id == payload.firm_id).first() is None
    ):
        raise HTTPException(status_code=400, detail="Firm not found")

    if db.query(User).filter(User.email == payload.email.lower()).first():
        raise HTTPException(status_code=409, detail="Email already in use")

    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=role,
        firm_id=payload.firm_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: UUID,
    payload: UserUpdateIn,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> User:
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    _ensure_can_manage(target, actor)

    data = payload.model_dump(exclude_unset=True)
    if "password" in data and data["password"]:
        target.password_hash = hash_password(data.pop("password"))
    for k, v in data.items():
        setattr(target, k, v)
    db.commit()
    db.refresh(target)
    return target


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> None:
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == actor.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    _ensure_can_manage(target, actor)
    db.delete(target)
    db.commit()

"""Firm memberships - allow one user (email) to operate in multiple firms.

A user's primary firm remains ``User.firm_id``. Memberships add additional
firms the same login can switch to via the firm switcher in the admin UI.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Firm, FirmMembership, User, UserRole
from app.schemas import FirmMembershipIn, FirmMembershipOut, MeFirmOut

router = APIRouter(prefix="/admin", tags=["admin:memberships"])


def _can_grant(actor: User, target: User) -> bool:
    if actor.role == UserRole.super_admin:
        return True
    # Firm-admins may only manage memberships of users in their own primary firm.
    return target.firm_id is not None and target.firm_id == actor.firm_id


@router.get("/users/{user_id}/firm-memberships", response_model=list[FirmMembershipOut])
def list_memberships(
    user_id: UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> list[FirmMembership]:
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if actor.id != target.id and not _can_grant(actor, target):
        raise HTTPException(status_code=403, detail="Forbidden")
    return list(target.memberships)


@router.post(
    "/users/{user_id}/firm-memberships",
    response_model=FirmMembershipOut,
    status_code=status.HTTP_201_CREATED,
)
def add_membership(
    user_id: UUID,
    payload: FirmMembershipIn,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> FirmMembership:
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if not _can_grant(actor, target):
        raise HTTPException(status_code=403, detail="Forbidden")
    if target.role == UserRole.super_admin:
        raise HTTPException(status_code=400, detail="Super admin already has all firms")
    if db.query(Firm).filter(Firm.id == payload.firm_id).first() is None:
        raise HTTPException(status_code=400, detail="Firm not found")
    if payload.firm_id == target.firm_id:
        raise HTTPException(status_code=400, detail="That is the user's primary firm")
    existing = (
        db.query(FirmMembership)
        .filter(
            FirmMembership.user_id == user_id,
            FirmMembership.firm_id == payload.firm_id,
        )
        .first()
    )
    if existing:
        return existing
    m = FirmMembership(user_id=user_id, firm_id=payload.firm_id)
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@router.delete(
    "/users/{user_id}/firm-memberships/{firm_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_membership(
    user_id: UUID,
    firm_id: UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> None:
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if not _can_grant(actor, target):
        raise HTTPException(status_code=403, detail="Forbidden")
    m = (
        db.query(FirmMembership)
        .filter(FirmMembership.user_id == user_id, FirmMembership.firm_id == firm_id)
        .first()
    )
    if m is None:
        raise HTTPException(status_code=404, detail="Membership not found")
    db.delete(m)
    db.commit()


# ---- helper used by /auth/me/firms ----


def me_firms(db: Session, user: User) -> list[MeFirmOut]:
    if user.role == UserRole.super_admin:
        firms = db.query(Firm).order_by(Firm.name.asc()).all()
        return [MeFirmOut(id=f.id, name=f.name, is_primary=False) for f in firms]
    out: list[MeFirmOut] = []
    seen: set[UUID] = set()
    if user.firm_id is not None and user.firm is not None:
        out.append(MeFirmOut(id=user.firm.id, name=user.firm.name, is_primary=True))
        seen.add(user.firm.id)
    for m in user.memberships:
        if m.firm_id in seen or m.firm is None:
            continue
        out.append(MeFirmOut(id=m.firm.id, name=m.firm.name, is_primary=False))
        seen.add(m.firm_id)
    out.sort(key=lambda x: (not x.is_primary, x.name.lower()))
    return out

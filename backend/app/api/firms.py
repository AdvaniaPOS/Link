from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_super_admin
from app.database import get_db
from app.models import Firm, User, UserRole
from app.schemas import FirmIn, FirmOut, FirmUpdateIn

router = APIRouter(prefix="/admin/firms", tags=["admin:firms"])


@router.get("", response_model=list[FirmOut])
def list_firms(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Firm]:
    q = db.query(Firm).order_by(Firm.created_at.desc())
    if user.role != UserRole.super_admin:
        q = q.filter(Firm.id == user.firm_id)
    return q.all()


@router.post("", response_model=FirmOut, status_code=status.HTTP_201_CREATED)
def create_firm(
    payload: FirmIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
) -> Firm:
    firm = Firm(**payload.model_dump())
    db.add(firm)
    db.commit()
    db.refresh(firm)
    return firm


@router.get("/{firm_id}", response_model=FirmOut)
def get_firm(
    firm_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Firm:
    if user.role != UserRole.super_admin and user.firm_id != firm_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    firm = db.query(Firm).filter(Firm.id == firm_id).first()
    if firm is None:
        raise HTTPException(status_code=404, detail="Firm not found")
    return firm


@router.patch("/{firm_id}", response_model=FirmOut)
def update_firm(
    firm_id: UUID,
    payload: FirmUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Firm:
    if user.role != UserRole.super_admin and user.firm_id != firm_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    firm = db.query(Firm).filter(Firm.id == firm_id).first()
    if firm is None:
        raise HTTPException(status_code=404, detail="Firm not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(firm, k, v)
    db.commit()
    db.refresh(firm)
    return firm


@router.delete("/{firm_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_firm(
    firm_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
) -> None:
    firm = db.query(Firm).filter(Firm.id == firm_id).first()
    if firm is None:
        raise HTTPException(status_code=404, detail="Firm not found")
    db.delete(firm)
    db.commit()

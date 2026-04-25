"""Accessory + AccessoryOrder admin endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_firm_access
from app.database import get_db
from app.models import Accessory, AccessoryOrder, Firm, FirmProduct, User
from app.schemas import (
    AccessoryIn,
    AccessoryOrderOut,
    AccessoryOut,
    AccessoryUpdateIn,
)

router = APIRouter(prefix="/admin/firms/{firm_id}/accessories", tags=["admin:accessories"])


@router.get("", response_model=list[AccessoryOut])
def list_accessories(
    firm_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Accessory]:
    require_firm_access(firm_id, user)
    return (
        db.query(Accessory)
        .filter(Accessory.firm_id == firm_id)
        .order_by(Accessory.sort_order, Accessory.created_at.desc())
        .all()
    )


@router.post("", response_model=AccessoryOut, status_code=status.HTTP_201_CREATED)
def create_accessory(
    firm_id: UUID,
    payload: AccessoryIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Accessory:
    require_firm_access(firm_id, user)
    if db.query(Firm).filter(Firm.id == firm_id).first() is None:
        raise HTTPException(status_code=404, detail="Firm not found")
    if payload.firm_product_id is not None:
        prod = (
            db.query(FirmProduct)
            .filter(
                FirmProduct.id == payload.firm_product_id,
                FirmProduct.firm_id == firm_id,
            )
            .first()
        )
        if prod is None:
            raise HTTPException(status_code=404, detail="Product not found in firm")
    item = Accessory(firm_id=firm_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/{accessory_id}", response_model=AccessoryOut)
def update_accessory(
    firm_id: UUID,
    accessory_id: UUID,
    payload: AccessoryUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Accessory:
    require_firm_access(firm_id, user)
    item = (
        db.query(Accessory)
        .filter(Accessory.id == accessory_id, Accessory.firm_id == firm_id)
        .first()
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Accessory not found")
    data = payload.model_dump(exclude_unset=True)
    if "firm_product_id" in data and data["firm_product_id"] is not None:
        prod = (
            db.query(FirmProduct)
            .filter(
                FirmProduct.id == data["firm_product_id"],
                FirmProduct.firm_id == firm_id,
            )
            .first()
        )
        if prod is None:
            raise HTTPException(status_code=404, detail="Product not found in firm")
    for k, v in data.items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{accessory_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_accessory(
    firm_id: UUID,
    accessory_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    require_firm_access(firm_id, user)
    item = (
        db.query(Accessory)
        .filter(Accessory.id == accessory_id, Accessory.firm_id == firm_id)
        .first()
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Accessory not found")
    db.delete(item)
    db.commit()


# ---------- orders (read-only listing for the admin portal) ----------

orders_router = APIRouter(
    prefix="/admin/firms/{firm_id}/accessory-orders",
    tags=["admin:accessory-orders"],
)


@orders_router.get("", response_model=list[AccessoryOrderOut])
def list_accessory_orders(
    firm_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[AccessoryOrder]:
    require_firm_access(firm_id, user)
    return (
        db.query(AccessoryOrder)
        .join(Accessory, AccessoryOrder.accessory_id == Accessory.id)
        .filter(Accessory.firm_id == firm_id)
        .order_by(AccessoryOrder.created_at.desc())
        .all()
    )

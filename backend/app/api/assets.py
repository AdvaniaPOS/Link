"""Asset CRUD scoped per firm."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_firm_access
from app.database import get_db
from app.models import Asset, Firm, FirmProduct, User
from app.schemas import AssetIn, AssetOut, AssetUpdateIn

router = APIRouter(prefix="/admin/firms/{firm_id}/assets", tags=["admin:assets"])


@router.get("", response_model=list[AssetOut])
def list_assets(
    firm_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Asset]:
    require_firm_access(firm_id, user)
    return (
        db.query(Asset)
        .filter(Asset.firm_id == firm_id)
        .order_by(Asset.created_at.desc())
        .all()
    )


@router.post("", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
def create_asset(
    firm_id: UUID,
    payload: AssetIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Asset:
    require_firm_access(firm_id, user)
    if db.query(Firm).filter(Firm.id == firm_id).first() is None:
        raise HTTPException(status_code=404, detail="Firm not found")
    fp = (
        db.query(FirmProduct)
        .filter(FirmProduct.id == payload.firm_product_id, FirmProduct.firm_id == firm_id)
        .first()
    )
    if fp is None:
        raise HTTPException(status_code=400, detail="Product not subscribed by this firm")
    asset = Asset(firm_id=firm_id, **payload.model_dump())
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


@router.patch("/{asset_id}", response_model=AssetOut)
def update_asset(
    firm_id: UUID,
    asset_id: UUID,
    payload: AssetUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Asset:
    require_firm_access(firm_id, user)
    asset = (
        db.query(Asset).filter(Asset.id == asset_id, Asset.firm_id == firm_id).first()
    )
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    data = payload.model_dump(exclude_unset=True)
    if "firm_product_id" in data:
        fp = (
            db.query(FirmProduct)
            .filter(FirmProduct.id == data["firm_product_id"], FirmProduct.firm_id == firm_id)
            .first()
        )
        if fp is None:
            raise HTTPException(status_code=400, detail="Product not subscribed by this firm")
    for k, v in data.items():
        setattr(asset, k, v)
    db.commit()
    db.refresh(asset)
    return asset


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(
    firm_id: UUID,
    asset_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    require_firm_access(firm_id, user)
    asset = (
        db.query(Asset).filter(Asset.id == asset_id, Asset.firm_id == firm_id).first()
    )
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    db.delete(asset)
    db.commit()

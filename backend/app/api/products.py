"""Firm-product subscriptions: link firms to global catalog + per-firm overrides."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_firm_access
from app.database import get_db
from app.models import Firm, FirmProduct, ProductCatalog, User
from app.schemas import (
    FirmProductLinkIn,
    FirmProductOverrideIn,
    ProductModelOut,
)

router = APIRouter(prefix="/admin/firms/{firm_id}/products", tags=["admin:products"])

OVERRIDE_FIELDS = (
    "description",
    "manual_url",
    "quick_guide_url",
    "warranty_url",
    "warranty_text",
)


def _to_effective_dict(fp: FirmProduct) -> dict:
    """Merge catalog defaults with per-firm overrides into the legacy product shape."""
    cat = fp.catalog
    return {
        "id": fp.id,
        "firm_id": fp.firm_id,
        "catalog_id": cat.id,
        "name": cat.name,
        "sku": cat.sku,
        "category": cat.category,
        "image_url": cat.image_url,
        "background_url": cat.background_url,
        "background_kind": cat.background_kind,
        "description": fp.description if fp.description is not None else cat.description,
        "manual_url": fp.manual_url if fp.manual_url is not None else cat.manual_url,
        "quick_guide_url": (
            fp.quick_guide_url if fp.quick_guide_url is not None else cat.quick_guide_url
        ),
        "warranty_url": fp.warranty_url if fp.warranty_url is not None else cat.warranty_url,
        "warranty_text": (fp.warranty_text if fp.warranty_text is not None else cat.warranty_text),
        "overrides": {f: getattr(fp, f) for f in OVERRIDE_FIELDS},
        "created_at": fp.created_at,
    }


@router.get("", response_model=list[ProductModelOut])
def list_firm_products(
    firm_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    require_firm_access(firm_id, user)
    rows = (
        db.query(FirmProduct)
        .options(joinedload(FirmProduct.catalog))
        .filter(FirmProduct.firm_id == firm_id)
        .order_by(FirmProduct.created_at.desc())
        .all()
    )
    return [_to_effective_dict(fp) for fp in rows]


@router.post("", response_model=ProductModelOut, status_code=status.HTTP_201_CREATED)
def link_firm_product(
    firm_id: UUID,
    payload: FirmProductLinkIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Subscribe a firm to a catalog product."""
    require_firm_access(firm_id, user)
    if db.query(Firm).filter(Firm.id == firm_id).first() is None:
        raise HTTPException(status_code=404, detail="Firm not found")
    if db.query(ProductCatalog).filter(ProductCatalog.id == payload.catalog_id).first() is None:
        raise HTTPException(status_code=404, detail="Catalog item not found")
    fp = FirmProduct(firm_id=firm_id, catalog_id=payload.catalog_id)
    db.add(fp)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Firma abonnerer allerede på dette produktet."
        ) from exc
    db.refresh(fp)
    fp = (
        db.query(FirmProduct)
        .options(joinedload(FirmProduct.catalog))
        .filter(FirmProduct.id == fp.id)
        .one()
    )
    return _to_effective_dict(fp)


@router.patch("/{firm_product_id}", response_model=ProductModelOut)
def update_overrides(
    firm_id: UUID,
    firm_product_id: UUID,
    payload: FirmProductOverrideIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    require_firm_access(firm_id, user)
    fp = (
        db.query(FirmProduct)
        .options(joinedload(FirmProduct.catalog))
        .filter(FirmProduct.id == firm_product_id, FirmProduct.firm_id == firm_id)
        .first()
    )
    if fp is None:
        raise HTTPException(status_code=404, detail="Firm product not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        if k in OVERRIDE_FIELDS:
            # Empty string → clear override / inherit from catalog.
            setattr(fp, k, v if v not in ("", None) else None)
    db.commit()
    db.refresh(fp)
    return _to_effective_dict(fp)


@router.delete("/{firm_product_id}", status_code=status.HTTP_204_NO_CONTENT)
def unlink_firm_product(
    firm_id: UUID,
    firm_product_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    require_firm_access(firm_id, user)
    fp = (
        db.query(FirmProduct)
        .filter(FirmProduct.id == firm_product_id, FirmProduct.firm_id == firm_id)
        .first()
    )
    if fp is None:
        raise HTTPException(status_code=404, detail="Firm product not found")
    try:
        db.delete(fp)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Firma har enheter knyttet til dette produktet. Slett enhetene først.",
        ) from exc

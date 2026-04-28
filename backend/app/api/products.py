"""Firm-product subscriptions: link firms to global catalog + per-firm overrides."""

from datetime import UTC, datetime
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


def _freeze(fp: FirmProduct) -> None:
    """Snapshot inheritable catalog values onto the firm product and mark it frozen.

    Once frozen, super-admin edits to the catalog no longer affect this firm.
    Idempotent — calling on an already-frozen product is a no-op.
    """
    if fp.frozen_at is not None:
        return
    cat = fp.catalog
    for f in OVERRIDE_FIELDS:
        if getattr(fp, f) is None:
            setattr(fp, f, getattr(cat, f))
    fp.frozen_at = datetime.now(UTC)


def _to_effective_dict(fp: FirmProduct) -> dict:
    """Merge catalog defaults with per-firm overrides into the legacy product shape.

    When the firm-product is frozen, only the firm's own (snapshotted) values
    are returned for the override fields — catalog drift is ignored.
    """
    cat = fp.catalog
    frozen = fp.frozen_at is not None

    def merged(field: str) -> str | None:
        own = getattr(fp, field)
        if frozen:
            return own
        return own if own is not None else getattr(cat, field)

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
        "description": merged("description"),
        "manual_url": merged("manual_url"),
        "quick_guide_url": merged("quick_guide_url"),
        "warranty_url": merged("warranty_url"),
        "warranty_text": merged("warranty_text"),
        "overrides": {f: getattr(fp, f) for f in OVERRIDE_FIELDS},
        "frozen_at": fp.frozen_at,
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

    # Snapshot catalog values onto the firm product so this firm becomes
    # immune to subsequent super-admin catalog edits.
    _freeze(fp)

    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        if k in OVERRIDE_FIELDS:
            # Empty string → keep current snapshot (cannot un-freeze back to
            # inheriting the live catalog).
            if v in ("", None):
                continue
            setattr(fp, k, v)
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

"""Global product catalog (super-admin only)."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_super_admin
from app.database import get_db
from app.models import ProductCatalog, User
from app.schemas import CatalogIn, CatalogOut, CatalogUpdateIn

router = APIRouter(prefix="/admin/catalog", tags=["admin:catalog"])


@router.get("", response_model=list[CatalogOut])
def list_catalog(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[ProductCatalog]:
    # Any authenticated admin (super or firm_admin) can browse the catalog,
    # so firm-admins can pick products to subscribe to. Mutations remain super-only.
    return db.query(ProductCatalog).order_by(ProductCatalog.name).all()


@router.post("", response_model=CatalogOut, status_code=status.HTTP_201_CREATED)
def create_catalog(
    payload: CatalogIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
) -> ProductCatalog:
    item = ProductCatalog(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/{catalog_id}", response_model=CatalogOut)
def update_catalog(
    catalog_id: UUID,
    payload: CatalogUpdateIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
) -> ProductCatalog:
    item = db.query(ProductCatalog).filter(ProductCatalog.id == catalog_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Catalog item not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{catalog_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_catalog(
    catalog_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
) -> None:
    item = db.query(ProductCatalog).filter(ProductCatalog.id == catalog_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Catalog item not found")
    try:
        db.delete(item)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Catalog item is in use by one or more firms; remove subscriptions first.",
        )

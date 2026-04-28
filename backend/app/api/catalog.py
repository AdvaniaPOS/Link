"""Product catalog (global super-admin entries + firm-private entries)."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import ProductCatalog, User, UserRole
from app.schemas import CatalogIn, CatalogOut, CatalogUpdateIn

router = APIRouter(prefix="/admin/catalog", tags=["admin:catalog"])


def _user_firm_ids(user: User) -> list[UUID]:
    ids: list[UUID] = []
    if user.firm_id is not None:
        ids.append(user.firm_id)
    for m in user.memberships:
        if m.firm_id not in ids:
            ids.append(m.firm_id)
    return ids


def _can_manage(item: ProductCatalog, user: User) -> bool:
    if user.role == UserRole.super_admin:
        return True
    if item.owner_firm_id is None:
        return False
    return item.owner_firm_id in _user_firm_ids(user)


@router.get("", response_model=list[CatalogOut])
def list_catalog(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ProductCatalog]:
    """Global products (owner_firm_id IS NULL) + items owned by the user's firms.
    Super-admin sees everything.
    """
    q = db.query(ProductCatalog)
    if user.role != UserRole.super_admin:
        firm_ids = _user_firm_ids(user)
        if firm_ids:
            q = q.filter(
                or_(
                    ProductCatalog.owner_firm_id.is_(None),
                    ProductCatalog.owner_firm_id.in_(firm_ids),
                )
            )
        else:
            q = q.filter(ProductCatalog.owner_firm_id.is_(None))
    return q.order_by(ProductCatalog.name).all()


@router.post("", response_model=CatalogOut, status_code=status.HTTP_201_CREATED)
def create_catalog(
    payload: CatalogIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProductCatalog:
    data = payload.model_dump()
    owner = data.get("owner_firm_id")
    if user.role != UserRole.super_admin:
        firm_ids = _user_firm_ids(user)
        if owner is None or owner not in firm_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Firm admins must create products owned by their own firm.",
            )
    item = ProductCatalog(**data)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/{catalog_id}", response_model=CatalogOut)
def update_catalog(
    catalog_id: UUID,
    payload: CatalogUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProductCatalog:
    item = db.query(ProductCatalog).filter(ProductCatalog.id == catalog_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Catalog item not found")
    if not _can_manage(item, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{catalog_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_catalog(
    catalog_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    item = db.query(ProductCatalog).filter(ProductCatalog.id == catalog_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Catalog item not found")
    if not _can_manage(item, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    try:
        db.delete(item)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Catalog item is in use by one or more firms; remove subscriptions first.",
        ) from exc

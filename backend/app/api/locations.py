"""Predefined location CRUD per firm.

Used by the festival scan flow to set ``Asset.location`` from a small,
admin-curated list (and to look up a Discord role mention so quick-support
notifications ping the right on-site team instead of ``@here``).
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_firm_access
from app.database import get_db
from app.models import Firm, FirmLocation, User
from app.schemas import FirmLocationIn, FirmLocationOut, FirmLocationUpdateIn

router = APIRouter(prefix="/admin/firms/{firm_id}/locations", tags=["admin:locations"])


@router.get("", response_model=list[FirmLocationOut])
def list_locations(
    firm_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[FirmLocation]:
    require_firm_access(firm_id, user)
    return (
        db.query(FirmLocation)
        .filter(FirmLocation.firm_id == firm_id)
        .order_by(FirmLocation.sort_order.asc(), FirmLocation.name.asc())
        .all()
    )


@router.post("", response_model=FirmLocationOut, status_code=status.HTTP_201_CREATED)
def create_location(
    firm_id: UUID,
    payload: FirmLocationIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FirmLocation:
    require_firm_access(firm_id, user)
    if db.query(Firm).filter(Firm.id == firm_id).first() is None:
        raise HTTPException(status_code=404, detail="Firm not found")
    name = payload.name.strip()
    if (
        db.query(FirmLocation)
        .filter(FirmLocation.firm_id == firm_id, FirmLocation.name == name)
        .first()
    ):
        raise HTTPException(status_code=409, detail="Location name already exists")
    loc = FirmLocation(
        firm_id=firm_id,
        name=name,
        discord_role_id=payload.discord_role_id or None,
        sort_order=payload.sort_order,
    )
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return loc


@router.patch("/{location_id}", response_model=FirmLocationOut)
def update_location(
    firm_id: UUID,
    location_id: UUID,
    payload: FirmLocationUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FirmLocation:
    require_firm_access(firm_id, user)
    loc = (
        db.query(FirmLocation)
        .filter(FirmLocation.id == location_id, FirmLocation.firm_id == firm_id)
        .first()
    )
    if loc is None:
        raise HTTPException(status_code=404, detail="Location not found")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"]:
        data["name"] = data["name"].strip()
    if "discord_role_id" in data and data["discord_role_id"] == "":
        data["discord_role_id"] = None
    for k, v in data.items():
        setattr(loc, k, v)
    db.commit()
    db.refresh(loc)
    return loc


@router.delete("/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_location(
    firm_id: UUID,
    location_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    require_firm_access(firm_id, user)
    loc = (
        db.query(FirmLocation)
        .filter(FirmLocation.id == location_id, FirmLocation.firm_id == firm_id)
        .first()
    )
    if loc is None:
        raise HTTPException(status_code=404, detail="Location not found")
    db.delete(loc)
    db.commit()

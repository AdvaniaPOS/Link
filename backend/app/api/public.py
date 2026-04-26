import logging
import secrets
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.config import get_settings
from app.database import get_db
from app.models import Accessory, AccessoryOrder, Asset, FirmProduct, Ticket
from app.rate_limit import limiter
from app.schemas import (
    AccessoryOrderCreated,
    AccessoryOrderIn,
    AccessoryPublic,
    AssetPublic,
    FirmPublic,
    ProductModelPublic,
    SupportTicketIn,
    TicketCreated,
)
from app.workers.tasks import send_accessory_order_email, send_resend_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/p", tags=["public"])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
EXT_BY_TYPE = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "image/gif": ".gif",
}


def _sniff_image_type(data: bytes) -> str | None:
    """Return a normalised mime type by inspecting magic bytes, or None.

    Defends against clients that lie about ``content_type`` (which is
    completely client-controlled in multipart uploads).
    """
    if len(data) < 12:
        return None
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    # HEIC/HEIF: ftyp box at bytes 4..8, brand at 8..12
    if data[4:8] == b"ftyp" and data[8:12] in (
        b"heic", b"heix", b"hevc", b"hevx", b"mif1", b"msf1", b"heim", b"heis",
    ):
        return "image/heic"
    return None


@router.get("/{asset_uuid}", response_model=AssetPublic)
def get_product_pass(asset_uuid: UUID, db: Session = Depends(get_db)) -> AssetPublic:
    asset = (
        db.query(Asset)
        .options(
            joinedload(Asset.firm),
            joinedload(Asset.firm_product).joinedload(FirmProduct.catalog),
        )
        .filter(Asset.id == asset_uuid)
        .first()
    )
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    fp = asset.firm_product
    return AssetPublic(
        id=asset.id,
        serial_number=asset.serial_number,
        location=asset.location,
        firm=FirmPublic.model_validate(asset.firm),
        product_model=ProductModelPublic(
            id=fp.id,
            name=fp.name,
            sku=fp.sku,
            category=fp.category,
            image_url=fp.image_url,
            background_url=fp.background_url,
            background_kind=fp.background_kind,
            description=fp.effective_description,
            manual_url=fp.effective_manual_url,
            quick_guide_url=fp.effective_quick_guide_url,
            warranty_url=fp.effective_warranty_url,
            warranty_text=fp.effective_warranty_text,
        ),
    )


@router.post(
    "/{asset_uuid}/attachment",
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit(lambda: get_settings().rate_limit_upload)
async def upload_attachment(
    request: Request,
    asset_uuid: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> dict:
    """Accept an image (camera or file picker) and store it under uploads/.

    Returns a relative URL that can be passed back as `attachment_url` when
    submitting a support ticket. The file bytes will be attached to the
    outgoing email by the worker.
    """
    asset = db.query(Asset).filter(Asset.id == asset_uuid).first()
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail=f"Unsupported file type: {content_type}")

    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB)")

    # Verify the file actually looks like an image (don't trust client header).
    sniffed = _sniff_image_type(data)
    if sniffed is None:
        raise HTTPException(status_code=415, detail="File does not appear to be a valid image")
    # Use the sniffed type to choose the extension on disk so a renamed .exe
    # can never get a misleading file name.
    content_type = sniffed

    settings = get_settings()
    uploads_dir = Path(settings.uploads_dir)
    uploads_dir.mkdir(parents=True, exist_ok=True)

    ext = EXT_BY_TYPE.get(content_type, ".bin")
    fname = f"{asset_uuid}_{secrets.token_urlsafe(8)}{ext}"
    target = uploads_dir / fname
    target.write_bytes(data)

    rel_url = f"/uploads/{fname}"
    return {
        "url": rel_url,
        "absolute_url": f"{settings.public_base_url.rstrip('/')}{rel_url}",
        "filename": file.filename or fname,
        "content_type": content_type,
        "size": len(data),
    }


@router.post(
    "/{asset_uuid}/support",
    response_model=TicketCreated,
    status_code=status.HTTP_202_ACCEPTED,
)
@limiter.limit(lambda: get_settings().rate_limit_public_post)
def submit_support(
    request: Request,
    asset_uuid: UUID,
    payload: SupportTicketIn,
    db: Session = Depends(get_db),
) -> Ticket:
    asset = db.query(Asset).filter(Asset.id == asset_uuid).first()
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    ticket = Ticket(
        asset_id=asset.id,
        customer_name=payload.customer_name,
        customer_email=payload.customer_email,
        customer_phone=payload.customer_phone,
        contact_preference=payload.contact_preference,
        message=payload.message,
        attachment_url=payload.attachment_url,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)

    # Enqueue Resend send via Celery. Don't fail the request if broker is down -
    # the ticket is persisted as 'pending' and can be retried from the admin UI.
    try:
        send_resend_email.delay(str(ticket.id))
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not enqueue ticket %s: %s", ticket.id, exc)

    return ticket


@router.get("/{asset_uuid}/accessories", response_model=list[AccessoryPublic])
def list_asset_accessories(
    asset_uuid: UUID, db: Session = Depends(get_db)
) -> list[Accessory]:
    """Accessories available for the product behind this asset.

    Returns firm-wide accessories (firm_product_id is NULL) plus accessories
    explicitly linked to this asset's firm-product subscription.
    """
    asset = db.query(Asset).filter(Asset.id == asset_uuid).first()
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    return (
        db.query(Accessory)
        .filter(
            Accessory.firm_id == asset.firm_id,
            Accessory.is_active.is_(True),
            or_(
                Accessory.firm_product_id.is_(None),
                Accessory.firm_product_id == asset.firm_product_id,
            ),
        )
        .order_by(Accessory.sort_order, Accessory.created_at.desc())
        .all()
    )


@router.post(
    "/{asset_uuid}/order",
    response_model=AccessoryOrderCreated,
    status_code=status.HTTP_202_ACCEPTED,
)
@limiter.limit(lambda: get_settings().rate_limit_public_post)
def submit_accessory_order(
    request: Request,
    asset_uuid: UUID,
    payload: AccessoryOrderIn,
    db: Session = Depends(get_db),
) -> AccessoryOrder:
    asset = db.query(Asset).filter(Asset.id == asset_uuid).first()
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    accessory = (
        db.query(Accessory)
        .filter(
            Accessory.id == payload.accessory_id,
            Accessory.firm_id == asset.firm_id,
            Accessory.is_active.is_(True),
        )
        .first()
    )
    if accessory is None:
        raise HTTPException(status_code=404, detail="Accessory not available")
    if (
        accessory.firm_product_id is not None
        and accessory.firm_product_id != asset.firm_product_id
    ):
        raise HTTPException(status_code=400, detail="Accessory not for this product")

    order = AccessoryOrder(
        asset_id=asset.id,
        accessory_id=accessory.id,
        quantity=payload.quantity,
        customer_name=payload.customer_name,
        customer_email=payload.customer_email,
        customer_phone=payload.customer_phone,
        note=payload.note,
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    try:
        send_accessory_order_email.delay(str(order.id))
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not enqueue order %s: %s", order.id, exc)

    return order

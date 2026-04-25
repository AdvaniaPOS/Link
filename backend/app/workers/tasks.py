from __future__ import annotations

import base64
import logging
import mimetypes
from datetime import datetime, timezone
from html import escape as _h
from pathlib import Path
from uuid import UUID

import resend
from celery.exceptions import MaxRetriesExceededError
from sqlalchemy.orm import joinedload

from app.config import get_settings
from app.database import SessionLocal
from app.models import Accessory, AccessoryOrder, Asset, FirmProduct, Ticket, TicketStatus
from app.workers.celery_app import celery_app

log = logging.getLogger(__name__)
settings = get_settings()
resend.api_key = settings.resend_api_key

# Accept #rgb / #rrggbb / common named colors. Anything else is dropped to a
# default to prevent CSS injection through admin-controlled brand colors.
_COLOR_NAMES = {
    "black", "white", "red", "green", "blue", "yellow", "orange", "purple",
    "pink", "gray", "grey", "teal", "cyan", "magenta", "brown", "navy",
}


def _is_safe_css_color(value: str | None) -> bool:
    if not value:
        return False
    v = value.strip().lower()
    if v in _COLOR_NAMES:
        return True
    if v.startswith("#") and len(v) in (4, 7) and all(c in "0123456789abcdef" for c in v[1:]):
        return True
    return False


def _load_local_attachment(attachment_url: str | None) -> dict | None:
    """If attachment_url points at our local /uploads/, return a Resend attachment
    dict with the file bytes. Otherwise return None.
    """
    if not attachment_url or not attachment_url.startswith("/uploads/"):
        return None
    fname = attachment_url[len("/uploads/"):]
    # prevent traversal
    if "/" in fname or "\\" in fname or ".." in fname:
        return None
    path = Path(settings.uploads_dir) / fname
    if not path.is_file():
        return None
    try:
        data = path.read_bytes()
    except OSError:
        return None
    ctype, _ = mimetypes.guess_type(str(path))
    return {
        "filename": fname,
        "content": base64.b64encode(data).decode("ascii"),
        "content_type": ctype or "application/octet-stream",
    }


def _build_email_payload(ticket: Ticket) -> dict:
    asset = ticket.asset
    firm = asset.firm
    product = asset.firm_product  # effective product (catalog name + sku)

    subject = f"[Support] Serial: {asset.serial_number} - {firm.name}"

    attachment_html = ""
    if ticket.attachment_url:
        if ticket.attachment_url.startswith("/uploads/"):
            absolute = f"{settings.public_base_url.rstrip('/')}{ticket.attachment_url}"
            attachment_html = (
                f'<p><strong>Vedlegg:</strong> bilde lagt ved e-posten '
                f'(<a href="{_h(absolute)}">{_h(absolute)}</a>).</p>'
            )
        else:
            url = _h(ticket.attachment_url)
            attachment_html = (
                f'<p><strong>Vedlegg:</strong> <a href="{url}">{url}</a></p>'
            )

    # Brand color is admin-controlled (CSS context); validate it loosely so we
    # don't allow arbitrary CSS injection via a malicious admin payload.
    brand_color = firm.brand_color if _is_safe_css_color(firm.brand_color) else "#0ea5e9"

    html = f"""
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #0f172a;">
      <h2 style="color: {brand_color};">Ny supporthenvendelse</h2>
      <p><strong>Firma:</strong> {_h(firm.name)}</p>
      <p><strong>Produkt:</strong> {_h(product.name)} ({_h(product.sku or '-')})</p>
      <p><strong>Serienummer:</strong> {_h(asset.serial_number)}</p>
      <p><strong>Lokasjon:</strong> {_h(asset.location or '-')}</p>
      <hr/>
      <p><strong>Fra:</strong> {_h(ticket.customer_name or '(uoppgitt)')} &lt;{_h(ticket.customer_email)}&gt;</p>
      <p><strong>Telefon:</strong> {_h(ticket.customer_phone or '-')}</p>
      <p><strong>Foretrekker svar via:</strong> {'Telefon' if ticket.contact_preference == 'phone' else 'E-post'}</p>
      <p><strong>Melding:</strong></p>
      <pre style="white-space: pre-wrap; background: #f8fafc; padding: 12px; border-radius: 6px;">{_h(ticket.message)}</pre>
      {attachment_html}
      <hr/>
      <p style="font-size: 12px; color: #64748b;">Sendt via Betala Link · Ticket {ticket.id}</p>
    </div>
    """

    return {
        "from": f"{settings.resend_from_name} <{settings.resend_from_email}>",
        "to": [firm.support_email_target],
        "reply_to": [ticket.customer_email],
        "subject": subject,
        "html": html,
    }


def _payload_with_attachment(payload: dict, attachment_url: str | None) -> dict:
    att = _load_local_attachment(attachment_url)
    if att is not None:
        payload["attachments"] = [att]
    return payload


@celery_app.task(
    bind=True,
    name="app.workers.tasks.send_resend_email",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=5,
)
def send_resend_email(self, ticket_id: str) -> dict:
    """Send a queued ticket via Resend. Retries with exponential backoff on failure."""
    ticket_uuid = UUID(ticket_id)
    db = SessionLocal()
    try:
        ticket = (
            db.query(Ticket)
            .options(
                joinedload(Ticket.asset).joinedload(Asset.firm),
                joinedload(Ticket.asset)
                .joinedload(Asset.firm_product)
                .joinedload(FirmProduct.catalog),
            )
            .filter(Ticket.id == ticket_uuid)
            .first()
        )
        if ticket is None:
            log.warning("Ticket %s not found", ticket_id)
            return {"status": "missing"}

        if ticket.status == TicketStatus.sent:
            return {"status": "already_sent", "message_id": ticket.resend_message_id}

        try:
            payload = _build_email_payload(ticket)
            payload = _payload_with_attachment(payload, ticket.attachment_url)
            response = resend.Emails.send(payload)
            ticket.status = TicketStatus.sent
            ticket.resend_message_id = response.get("id") if isinstance(response, dict) else None
            ticket.sent_at = datetime.now(timezone.utc)
            ticket.last_error = None
            db.commit()
            return {"status": "sent", "message_id": ticket.resend_message_id}
        except Exception as exc:  # noqa: BLE001
            ticket.last_error = str(exc)[:2000]
            ticket.status = TicketStatus.failed
            db.commit()
            try:
                raise self.retry(exc=exc)
            except MaxRetriesExceededError:
                log.exception("Giving up on ticket %s", ticket_id)
                return {"status": "failed", "error": str(exc)}
    finally:
        db.close()


def _build_order_payload(order: AccessoryOrder) -> dict:
    asset = order.asset
    firm = asset.firm
    product = asset.firm_product
    accessory = order.accessory

    subject = f"[Bestilling] {accessory.name} x{order.quantity} - {firm.name}"

    note_html = (
        f'<p><strong>Melding:</strong></p><pre style="white-space: pre-wrap; '
        f'background:#f8fafc; padding:12px; border-radius:6px;">{_h(order.note)}</pre>'
        if order.note
        else ""
    )
    price_html = (
        f"<p><strong>Pris:</strong> {_h(accessory.price_label)}</p>"
        if accessory.price_label
        else ""
    )

    brand_color = firm.brand_color if _is_safe_css_color(firm.brand_color) else "#0ea5e9"
    unit_str = (' ' + _h(accessory.unit)) if accessory.unit else ''

    html = f"""
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #0f172a;">
      <h2 style="color: {brand_color};">Ny tilbeh\u00f8rsbestilling</h2>
      <p><strong>Vare:</strong> {_h(accessory.name)} ({_h(accessory.sku or '-')})</p>
      <p><strong>Antall:</strong> {order.quantity}{unit_str}</p>
      {price_html}
      <hr/>
      <p><strong>Fra enhet:</strong> {_h(product.name)} - serienr {_h(asset.serial_number)}</p>
      <p><strong>Lokasjon:</strong> {_h(asset.location or '-')}</p>
      <hr/>
      <p><strong>Bestilt av:</strong> {_h(order.customer_name or '(uoppgitt)')} &lt;{_h(order.customer_email)}&gt;</p>
      <p><strong>Telefon:</strong> {_h(order.customer_phone or '-')}</p>
      {note_html}
      <hr/>
      <p style="font-size: 12px; color: #64748b;">Sendt via Betala Link \u00b7 Ordre {order.id}</p>
    </div>
    """

    return {
        "from": f"{settings.resend_from_name} <{settings.resend_from_email}>",
        "to": [firm.support_email_target],
        "reply_to": [order.customer_email],
        "subject": subject,
        "html": html,
    }


@celery_app.task(
    bind=True,
    name="app.workers.tasks.send_accessory_order_email",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=5,
)
def send_accessory_order_email(self, order_id: str) -> dict:
    """Email an accessory order to the firm's support inbox."""
    order_uuid = UUID(order_id)
    db = SessionLocal()
    try:
        order = (
            db.query(AccessoryOrder)
            .options(
                joinedload(AccessoryOrder.asset).joinedload(Asset.firm),
                joinedload(AccessoryOrder.asset)
                .joinedload(Asset.firm_product)
                .joinedload(FirmProduct.catalog),
                joinedload(AccessoryOrder.accessory),
            )
            .filter(AccessoryOrder.id == order_uuid)
            .first()
        )
        if order is None:
            log.warning("AccessoryOrder %s not found", order_id)
            return {"status": "missing"}
        if order.status == "sent":
            return {"status": "already_sent", "message_id": order.resend_message_id}

        try:
            payload = _build_order_payload(order)
            response = resend.Emails.send(payload)
            order.status = "sent"
            order.resend_message_id = response.get("id") if isinstance(response, dict) else None
            order.sent_at = datetime.now(timezone.utc)
            order.last_error = None
            db.commit()
            return {"status": "sent", "message_id": order.resend_message_id}
        except Exception as exc:  # noqa: BLE001
            order.last_error = str(exc)[:2000]
            order.status = "failed"
            db.commit()
            try:
                raise self.retry(exc=exc)
            except MaxRetriesExceededError:
                log.exception("Giving up on order %s", order_id)
                return {"status": "failed", "error": str(exc)}
    finally:
        db.close()


# Reference Accessory in case it's needed for typing - keeps the import used.
_ = Accessory

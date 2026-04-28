from __future__ import annotations

import base64
import logging
import mimetypes
from datetime import UTC, datetime
from html import escape as _h
from pathlib import Path
from uuid import UUID

import httpx
import resend
from celery.exceptions import MaxRetriesExceededError
from sqlalchemy.orm import joinedload

from app.config import get_settings
from app.database import SessionLocal
from app.models import (
    Accessory,
    AccessoryOrder,
    Asset,
    FirmLocation,
    FirmProduct,
    Ticket,
    TicketStatus,
)
from app.workers.celery_app import celery_app

log = logging.getLogger(__name__)
settings = get_settings()
resend.api_key = settings.resend_api_key

# Hard cap on Discord field sizes; Discord rejects fields > 1024 chars and
# embed.description > 4096. We keep generous slack but stay safe.
_DISCORD_FIELD_MAX = 1000
_DISCORD_DESC_MAX = 3500


def _truncate(value: str | None, limit: int) -> str:
    if not value:
        return "—"
    s = str(value)
    return s if len(s) <= limit else s[: limit - 1] + "…"


def _resolve_discord_webhook(firm, asset) -> str | None:
    """Pick the Discord webhook URL to use for this asset, or None.

    Returns None if the firm hasn't opted in or no URL is configured.
    Per-asset URL overrides the firm default when set.
    """
    if not getattr(firm, "discord_enabled", False):
        return None
    asset_url = (getattr(asset, "discord_webhook_url", None) or "").strip()
    if asset_url:
        return asset_url
    firm_url = (getattr(firm, "discord_webhook_url", None) or "").strip()
    return firm_url or None


def _resolve_location_role_id(firm, asset) -> str | None:
    """If asset.location matches a predefined FirmLocation with a Discord
    role id, return it. Used to ping the on-site team for that area instead
    of the generic ``@here`` mention.
    """
    location = (getattr(asset, "location", None) or "").strip()
    if not location:
        return None
    db = SessionLocal()
    try:
        loc = (
            db.query(FirmLocation)
            .filter(FirmLocation.firm_id == firm.id, FirmLocation.name == location)
            .first()
        )
        if loc is None or not loc.discord_role_id:
            return None
        return loc.discord_role_id
    finally:
        db.close()


def _mention_for_asset(firm, asset, fallback: str = "@here") -> tuple[str, dict | None]:
    """Return (content_prefix, allowed_mentions) for a Discord notification.

    Prefers a role mention scoped to the asset's location so on-site staff
    get a targeted ping. Falls back to ``fallback`` (typically ``@here``).
    """
    role_id = _resolve_location_role_id(firm, asset)
    if role_id:
        return f"<@&{role_id}>", {"parse": [], "roles": [role_id]}
    return fallback, None


def _post_discord_webhook(url: str, payload: dict) -> None:
    """POST to a Discord webhook. Best-effort; logs failures but never raises."""
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.post(url, json=payload)
            if r.status_code >= 300:
                log.warning("Discord webhook returned %s: %s", r.status_code, r.text[:300])
    except Exception as exc:  # noqa: BLE001
        log.warning("Discord webhook failed: %s", exc)


def notify_discord_quick_support(asset: Asset) -> tuple[bool, str | None]:
    """Send a "needs help now" Discord notification for a single asset.

    Synchronous and strict: returns (delivered, error_message). The endpoint
    surfaces failures to the caller so the festival operator sees a clear
    error if the webhook is misconfigured or down.
    """
    firm = asset.firm
    url = _resolve_discord_webhook(firm, asset)
    if not url:
        return False, "Discord-varsling er ikke aktivert eller webhook mangler."
    product = asset.firm_product
    fields = [
        {"name": "Firma", "value": _truncate(firm.name, _DISCORD_FIELD_MAX), "inline": True},
        {"name": "Produkt", "value": _truncate(product.name, _DISCORD_FIELD_MAX), "inline": True},
        {
            "name": "Serienr",
            "value": _truncate(asset.serial_number, _DISCORD_FIELD_MAX),
            "inline": True,
        },
        {
            "name": "Lokasjon",
            "value": _truncate(asset.location, _DISCORD_FIELD_MAX),
            "inline": True,
        },
    ]
    embed = {
        "title": "🚨 Trenger hjelp NÅ",
        "description": "En enhet har bedt om assistanse via Quick support.",
        "color": 0xDC2626,
        "fields": fields,
        "footer": {"text": "Betala Link · Quick support"},
    }
    content, allowed = _mention_for_asset(firm, asset, fallback="@here")
    payload: dict = {"content": content, "embeds": [embed]}
    if allowed is not None:
        payload["allowed_mentions"] = allowed
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.post(url, json=payload)
        if r.status_code >= 300:
            log.warning("Quick support webhook returned %s: %s", r.status_code, r.text[:300])
            return False, f"Discord svarte {r.status_code}."
        return True, None
    except Exception as exc:  # noqa: BLE001
        log.warning("Quick support webhook failed: %s", exc)
        return False, "Kunne ikke nå Discord."


def _notify_discord_ticket(ticket: Ticket) -> None:
    asset = ticket.asset
    firm = asset.firm
    url = _resolve_discord_webhook(firm, asset)
    if not url:
        return
    product = asset.firm_product
    contact_pref = "Telefon" if ticket.contact_preference == "phone" else "E-post"
    fields = [
        {"name": "Firma", "value": _truncate(firm.name, _DISCORD_FIELD_MAX), "inline": True},
        {"name": "Produkt", "value": _truncate(product.name, _DISCORD_FIELD_MAX), "inline": True},
        {
            "name": "Serienr",
            "value": _truncate(asset.serial_number, _DISCORD_FIELD_MAX),
            "inline": True,
        },
        {
            "name": "Lokasjon",
            "value": _truncate(asset.location, _DISCORD_FIELD_MAX),
            "inline": True,
        },
        {
            "name": "Fra",
            "value": _truncate(
                f"{ticket.customer_name or '(uoppgitt)'} <{ticket.customer_email}>",
                _DISCORD_FIELD_MAX,
            ),
            "inline": False,
        },
        {
            "name": "Telefon",
            "value": _truncate(ticket.customer_phone, _DISCORD_FIELD_MAX),
            "inline": True,
        },
        {"name": "Foretrekker", "value": contact_pref, "inline": True},
        {
            "name": "Melding",
            "value": _truncate(ticket.message, _DISCORD_FIELD_MAX),
            "inline": False,
        },
    ]
    if ticket.attachment_url:
        if ticket.attachment_url.startswith("/uploads/"):
            absolute = f"{settings.public_base_url.rstrip('/')}{ticket.attachment_url}"
        else:
            absolute = ticket.attachment_url
        fields.append(
            {"name": "Vedlegg", "value": _truncate(absolute, _DISCORD_FIELD_MAX), "inline": False}
        )

    embed = {
        "title": "Ny supporthenvendelse",
        "description": _truncate(f"Ticket `{ticket.id}`", _DISCORD_DESC_MAX),
        "color": 0x4F46E5,
        "fields": fields,
        "footer": {"text": "Betala Link"},
    }
    content, allowed = _mention_for_asset(firm, asset, fallback="")
    payload: dict = {"embeds": [embed]}
    if content:
        payload["content"] = content
    if allowed is not None:
        payload["allowed_mentions"] = allowed
    _post_discord_webhook(url, payload)


def _notify_discord_order(order: AccessoryOrder) -> None:
    asset = order.asset
    firm = asset.firm
    url = _resolve_discord_webhook(firm, asset)
    if not url:
        return
    accessory = order.accessory
    product = asset.firm_product
    unit = f" {accessory.unit}" if accessory.unit else ""
    fields = [
        {"name": "Firma", "value": _truncate(firm.name, _DISCORD_FIELD_MAX), "inline": True},
        {
            "name": "Vare",
            "value": _truncate(f"{accessory.name} ({accessory.sku or '-'})", _DISCORD_FIELD_MAX),
            "inline": True,
        },
        {
            "name": "Antall",
            "value": _truncate(f"{order.quantity}{unit}", _DISCORD_FIELD_MAX),
            "inline": True,
        },
    ]
    if accessory.price_label:
        fields.append(
            {
                "name": "Pris",
                "value": _truncate(accessory.price_label, _DISCORD_FIELD_MAX),
                "inline": True,
            }
        )
    fields += [
        {"name": "Produkt", "value": _truncate(product.name, _DISCORD_FIELD_MAX), "inline": True},
        {
            "name": "Serienr",
            "value": _truncate(asset.serial_number, _DISCORD_FIELD_MAX),
            "inline": True,
        },
        {
            "name": "Lokasjon",
            "value": _truncate(asset.location, _DISCORD_FIELD_MAX),
            "inline": True,
        },
        {
            "name": "Bestilt av",
            "value": _truncate(
                f"{order.customer_name or '(uoppgitt)'} <{order.customer_email}>",
                _DISCORD_FIELD_MAX,
            ),
            "inline": False,
        },
        {
            "name": "Telefon",
            "value": _truncate(order.customer_phone, _DISCORD_FIELD_MAX),
            "inline": True,
        },
    ]
    if order.note:
        fields.append(
            {"name": "Melding", "value": _truncate(order.note, _DISCORD_FIELD_MAX), "inline": False}
        )

    embed = {
        "title": "Ny tilbehørsbestilling",
        "description": _truncate(f"Ordre `{order.id}`", _DISCORD_DESC_MAX),
        "color": 0x10B981,
        "fields": fields,
        "footer": {"text": "Betala Link"},
    }
    _post_discord_webhook(url, {"embeds": [embed]})


# Accept #rgb / #rrggbb / common named colors. Anything else is dropped to a
# default to prevent CSS injection through admin-controlled brand colors.
_COLOR_NAMES = {
    "black",
    "white",
    "red",
    "green",
    "blue",
    "yellow",
    "orange",
    "purple",
    "pink",
    "gray",
    "grey",
    "teal",
    "cyan",
    "magenta",
    "brown",
    "navy",
}


def _is_safe_css_color(value: str | None) -> bool:
    if not value:
        return False
    v = value.strip().lower()
    if v in _COLOR_NAMES:
        return True
    return v.startswith("#") and len(v) in (4, 7) and all(c in "0123456789abcdef" for c in v[1:])


def _load_local_attachment(attachment_url: str | None) -> dict | None:
    """If attachment_url points at our local /uploads/, return a Resend attachment
    dict with the file bytes. Otherwise return None.
    """
    if not attachment_url or not attachment_url.startswith("/uploads/"):
        return None
    fname = attachment_url[len("/uploads/") :]
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
                f"<p><strong>Vedlegg:</strong> bilde lagt ved e-posten "
                f'(<a href="{_h(absolute)}">{_h(absolute)}</a>).</p>'
            )
        else:
            url = _h(ticket.attachment_url)
            attachment_html = f'<p><strong>Vedlegg:</strong> <a href="{url}">{url}</a></p>'

    # Brand color is admin-controlled (CSS context); validate it loosely so we
    # don't allow arbitrary CSS injection via a malicious admin payload.
    brand_color = firm.brand_color if _is_safe_css_color(firm.brand_color) else "#0ea5e9"

    html = f"""
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #0f172a;">
      <h2 style="color: {brand_color};">Ny supporthenvendelse</h2>
      <p><strong>Firma:</strong> {_h(firm.name)}</p>
      <p><strong>Produkt:</strong> {_h(product.name)} ({_h(product.sku or "-")})</p>
      <p><strong>Serienummer:</strong> {_h(asset.serial_number)}</p>
      <p><strong>Lokasjon:</strong> {_h(asset.location or "-")}</p>
      <hr/>
      <p><strong>Fra:</strong> {_h(ticket.customer_name or "(uoppgitt)")} &lt;{_h(ticket.customer_email)}&gt;</p>
      <p><strong>Telefon:</strong> {_h(ticket.customer_phone or "-")}</p>
      <p><strong>Foretrekker svar via:</strong> {"Telefon" if ticket.contact_preference == "phone" else "E-post"}</p>
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
            ticket.sent_at = datetime.now(UTC)
            ticket.last_error = None
            db.commit()
            _notify_discord_ticket(ticket)
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
    unit_str = (" " + _h(accessory.unit)) if accessory.unit else ""

    html = f"""
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #0f172a;">
      <h2 style="color: {brand_color};">Ny tilbeh\u00f8rsbestilling</h2>
      <p><strong>Vare:</strong> {_h(accessory.name)} ({_h(accessory.sku or "-")})</p>
      <p><strong>Antall:</strong> {order.quantity}{unit_str}</p>
      {price_html}
      <hr/>
      <p><strong>Fra enhet:</strong> {_h(product.name)} - serienr {_h(asset.serial_number)}</p>
      <p><strong>Lokasjon:</strong> {_h(asset.location or "-")}</p>
      <hr/>
      <p><strong>Bestilt av:</strong> {_h(order.customer_name or "(uoppgitt)")} &lt;{_h(order.customer_email)}&gt;</p>
      <p><strong>Telefon:</strong> {_h(order.customer_phone or "-")}</p>
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
            order.sent_at = datetime.now(UTC)
            order.last_error = None
            db.commit()
            _notify_discord_order(order)
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


@celery_app.task(
    bind=True,
    name="app.workers.tasks.send_password_reset_email",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=3,
)
def send_password_reset_email(self, to_email: str, full_name: str, reset_link: str) -> dict:
    """Send a password-reset email via Resend.

    Best-effort with retries. The link contains the raw token; only the
    hashed form is stored in the database.
    """
    safe_name = _h(full_name) if full_name else _h(to_email)
    safe_link = _h(reset_link)
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a;">
      <h2 style="color:#0f172a;">Tilbakestill passord</h2>
      <p>Hei {safe_name},</p>
      <p>Vi mottok en forespørsel om å tilbakestille passordet ditt på Betala&nbsp;Link.</p>
      <p>
        <a href="{safe_link}" style="display:inline-block;padding:10px 18px;background:#2563eb;
        color:#fff;text-decoration:none;border-radius:6px;">Velg nytt passord</a>
      </p>
      <p>Lenken er gyldig i {get_settings().password_reset_minutes} minutter.</p>
      <p>Hvis du ikke ba om dette, kan du trygt ignorere denne e-posten.</p>
      <p style="color:#64748b;font-size:12px;">Hvis knappen ikke virker, lim inn denne URL-en i nettleseren:<br />{safe_link}</p>
    </div>
    """
    payload = {
        "from": f"{settings.resend_from_name} <{settings.resend_from_email}>",
        "to": [to_email],
        "subject": "Tilbakestill passord — Betala Link",
        "html": html,
    }
    try:
        response = resend.Emails.send(payload)
        msg_id = response.get("id") if isinstance(response, dict) else None
        return {"status": "sent", "message_id": msg_id}
    except Exception as exc:  # noqa: BLE001
        try:
            raise self.retry(exc=exc)
        except MaxRetriesExceededError:
            log.exception("Giving up on password-reset email to %s", to_email)
            return {"status": "failed", "error": str(exc)}

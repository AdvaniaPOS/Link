"""Audit log writer.

Use ``log_audit(...)`` from API code to record security-relevant actions.
Writes are best-effort — a failure here must never block the user-facing
operation, so callers should treat exceptions as non-fatal.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import AuditLog, User

log = logging.getLogger(__name__)


def log_audit(
    db: Session,
    *,
    action: str,
    actor: User | None = None,
    actor_email: str | None = None,
    target_type: str | None = None,
    target_id: str | UUID | None = None,
    request: Request | None = None,
    extra: dict[str, Any] | None = None,
    commit: bool = False,
) -> None:
    try:
        ip: str | None = None
        ua: str | None = None
        if request is not None:
            ip = request.client.host if request.client else None
            # Trust X-Forwarded-For only if uvicorn was started with --proxy-headers.
            xff = request.headers.get("x-forwarded-for")
            if xff:
                ip = xff.split(",")[0].strip()
            ua = (request.headers.get("user-agent") or "")[:255] or None

        entry = AuditLog(
            id=uuid4(),
            actor_user_id=actor.id if actor is not None else None,
            actor_email=(actor.email if actor is not None else actor_email),
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            ip=ip,
            user_agent=ua,
            extra=extra,
            created_at=datetime.now(UTC),
        )
        db.add(entry)
        if commit:
            db.commit()
    except Exception:  # noqa: BLE001
        log.exception("audit log write failed for action=%s", action)

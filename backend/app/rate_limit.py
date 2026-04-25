"""Rate limiting via slowapi.

Configured with sensible per-route limits in :mod:`app.main` and applied as
decorators on individual route handlers. Disabled with
``RATE_LIMIT_ENABLED=false`` (e.g. in tests).

Storage defaults to in-memory (per-process). For multi-replica deployments
set ``RATE_LIMIT_STORAGE_URI=redis://...`` so all workers share state.
"""

from __future__ import annotations

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import get_settings


def _key_func(request: Request) -> str:
    """Use the X-Forwarded-For client (when behind nginx) else peer address."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        # First entry is the original client.
        return fwd.split(",")[0].strip()
    return get_remote_address(request)


_settings = get_settings()

limiter = Limiter(
    key_func=_key_func,
    default_limits=[_settings.rate_limit_default],
    enabled=_settings.rate_limit_enabled,
    storage_uri=_settings.rate_limit_storage_uri or "memory://",
    headers_enabled=True,
)

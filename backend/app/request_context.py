"""Per-request context: a contextvar-backed request id surfaced in logs.

Used by:
- :mod:`app.logging_config` – injects ``request_id`` into every log record so
  ``%(request_id)s`` works in the formatter.
- :mod:`app.main` – an ASGI middleware reads/sets the ``X-Request-ID`` header
  and stores it in the contextvar for the duration of the request.
"""

from __future__ import annotations

from contextvars import ContextVar

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

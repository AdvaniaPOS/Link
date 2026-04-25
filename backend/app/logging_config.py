"""Centralised logging configuration.

Call :func:`configure_logging` once at process start (e.g. from
``app.main``). All modules can then use ``logging.getLogger(__name__)``
and inherit the configured handler/format.
"""

from __future__ import annotations

import logging
from logging.config import dictConfig

from app.request_context import request_id_var

_CONFIGURED = False


class _RequestIdFilter(logging.Filter):
    """Inject the current request id (or '-') onto every record."""

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: D401
        record.request_id = request_id_var.get()
        return True


def configure_logging(level: str = "INFO") -> None:
    """Apply a consistent log format across the app and uvicorn loggers."""
    global _CONFIGURED
    if _CONFIGURED:
        return

    level = (level or "INFO").upper()

    dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "filters": {
                "request_id": {"()": _RequestIdFilter},
            },
            "formatters": {
                "default": {
                    "format": "%(asctime)s %(levelname)-7s [%(request_id)s] %(name)s: %(message)s",
                    "datefmt": "%Y-%m-%d %H:%M:%S",
                },
            },
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "formatter": "default",
                    "filters": ["request_id"],
                },
            },
            "root": {"level": level, "handlers": ["console"]},
            "loggers": {
                # Tame noisy third-parties; keep the app's own loggers at the root level.
                "uvicorn": {"level": level, "handlers": ["console"], "propagate": False},
                "uvicorn.access": {"level": level, "handlers": ["console"], "propagate": False},
                "uvicorn.error": {"level": level, "handlers": ["console"], "propagate": False},
                "sqlalchemy.engine": {"level": "WARNING"},
                "celery": {"level": level},
            },
        }
    )

    _CONFIGURED = True
    logging.getLogger(__name__).debug("logging configured at level=%s", level)

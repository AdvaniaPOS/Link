import logging
import uuid
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.accessories import (
    orders_router as accessory_orders_router,
)
from app.api.accessories import (
    router as accessories_router,
)
from app.api.admin import router as admin_router
from app.api.assets import router as assets_router
from app.api.auth import router as auth_router
from app.api.catalog import router as catalog_router
from app.api.firms import router as firms_router
from app.api.locations import router as locations_router
from app.api.memberships import router as memberships_router
from app.api.products import router as products_router
from app.api.public import router as public_router
from app.api.tickets import router as tickets_router
from app.api.uploads import router as uploads_router
from app.api.users import router as users_router
from app.config import get_settings
from app.logging_config import configure_logging
from app.rate_limit import limiter
from app.request_context import request_id_var

settings = get_settings()
configure_logging(settings.log_level)
logger = logging.getLogger("app")

app = FastAPI(title="Tagly API", version="0.2.0")

# slowapi wires itself to the app via state + middleware + exception handler.
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": f"Rate limit exceeded: {exc.detail}"},
        headers={"Retry-After": "60"},
    )


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Read or generate ``X-Request-ID`` and expose it via :mod:`request_context`.

    Adds the same header on the response so clients/log aggregators can
    correlate a single request end-to-end.
    """

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
        token = request_id_var.set(rid)
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)
        response.headers["X-Request-ID"] = rid
        return response


# Order matters: outer middlewares run first on request, last on response.
# TrustedHost (if configured) runs before anything else.
if settings.trusted_host_list:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.trusted_host_list)

app.add_middleware(GZipMiddleware, minimum_size=settings.gzip_min_size)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(RequestIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


@app.exception_handler(Exception)
async def _unhandled_exception(request: Request, exc: Exception) -> JSONResponse:
    """Last-resort handler so 500s never leak stack traces to clients."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "request_id": request_id_var.get()},
    )


API_PREFIX = "/api"
app.include_router(public_router, prefix=API_PREFIX)
app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(admin_router, prefix=API_PREFIX)
app.include_router(firms_router, prefix=API_PREFIX)
app.include_router(catalog_router, prefix=API_PREFIX)
app.include_router(products_router, prefix=API_PREFIX)
app.include_router(assets_router, prefix=API_PREFIX)
app.include_router(locations_router, prefix=API_PREFIX)
app.include_router(memberships_router, prefix=API_PREFIX)
app.include_router(tickets_router, prefix=API_PREFIX)
app.include_router(users_router, prefix=API_PREFIX)
app.include_router(accessories_router, prefix=API_PREFIX)
app.include_router(accessory_orders_router, prefix=API_PREFIX)
app.include_router(uploads_router, prefix=API_PREFIX)

# Serve uploaded attachments (support photos) so they can be referenced from
# emails and viewed in the admin UI.
_uploads_path = Path(settings.uploads_dir)
_uploads_path.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_uploads_path)), name="uploads")


@app.get("/api/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}


if settings.debug_endpoints:

    @app.get("/api/_debug/celery", tags=["meta"])
    def debug_celery() -> dict[str, object]:
        import os

        from app.workers.celery_app import celery_app

        return {
            "cwd": os.getcwd(),
            "settings_eager": settings.celery_eager,
            "settings_broker": settings.celery_broker_url,
            "celery_eager": celery_app.conf.task_always_eager,
            "celery_broker": str(celery_app.conf.broker_url),
            "key_prefix": settings.resend_api_key[:8],
        }

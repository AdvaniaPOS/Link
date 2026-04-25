from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.api.admin import router as admin_router
from app.api.assets import router as assets_router
from app.api.auth import router as auth_router
from app.api.catalog import router as catalog_router
from app.api.firms import router as firms_router
from app.api.products import router as products_router
from app.api.public import router as public_router
from app.api.tickets import router as tickets_router
from app.api.users import router as users_router
from app.api.accessories import (
    orders_router as accessory_orders_router,
    router as accessories_router,
)
from app.config import get_settings

settings = get_settings()

app = FastAPI(title="Betala Link API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api"
app.include_router(public_router, prefix=API_PREFIX)
app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(admin_router, prefix=API_PREFIX)
app.include_router(firms_router, prefix=API_PREFIX)
app.include_router(catalog_router, prefix=API_PREFIX)
app.include_router(products_router, prefix=API_PREFIX)
app.include_router(assets_router, prefix=API_PREFIX)
app.include_router(tickets_router, prefix=API_PREFIX)
app.include_router(users_router, prefix=API_PREFIX)
app.include_router(accessories_router, prefix=API_PREFIX)
app.include_router(accessory_orders_router, prefix=API_PREFIX)

# Serve uploaded attachments (support photos) so they can be referenced from
# emails and viewed in the admin UI.
_uploads_path = Path(settings.uploads_dir)
_uploads_path.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_uploads_path)), name="uploads")


@app.get("/api/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/_debug/celery", tags=["meta"])
def debug_celery() -> dict[str, object]:
    import os

    from app.config import get_settings
    from app.workers.celery_app import celery_app

    s = get_settings()
    return {
        "cwd": os.getcwd(),
        "settings_eager": s.celery_eager,
        "settings_broker": s.celery_broker_url,
        "celery_eager": celery_app.conf.task_always_eager,
        "celery_broker": str(celery_app.conf.broker_url),
        "key_prefix": s.resend_api_key[:8],
    }

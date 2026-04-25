from celery import Celery

from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "betala_link",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    broker_connection_retry_on_startup=True,
    task_always_eager=settings.celery_eager,
    task_eager_propagates=settings.celery_eager,
)

# Ensure shared_task and any task lookup resolves to *this* app, not whatever
# Celery happens to consider "current". Without this, @shared_task tasks may
# bind to a default Celery app that has no broker/eager config.
celery_app.set_default()

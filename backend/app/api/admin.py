from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_firm_access, require_super_admin
from app.database import get_db
from app.models import Asset, AuditLog, Ticket, User
from app.schemas import AuditLogOut, TicketCreated
from app.workers.tasks import send_resend_email

router = APIRouter(prefix="/admin", tags=["admin:test-email"])


class TestEmailIn(BaseModel):
    recipient_email: EmailStr | None = None
    note: str | None = None


@router.post(
    "/assets/{asset_uuid}/test-email",
    response_model=TicketCreated,
    status_code=status.HTTP_202_ACCEPTED,
)
def send_test_email(
    asset_uuid: UUID,
    payload: TestEmailIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Ticket:
    asset = db.query(Asset).filter(Asset.id == asset_uuid).first()
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    require_firm_access(asset.firm_id, user)

    reply_to = payload.recipient_email or asset.firm.support_email_target

    ticket = Ticket(
        asset_id=asset.id,
        customer_name="Betala Link – Test",
        customer_email=reply_to,
        message=(
            "Dette er en testmelding sendt fra admin-panelet via Resend-pipelinen."
            + (f"\n\nNotat: {payload.note}" if payload.note else "")
        ),
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)

    send_resend_email.delay(str(ticket.id))
    return ticket


@router.get("/audit-logs", response_model=list[AuditLogOut])
def list_audit_logs(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin),
    action: str | None = Query(None, max_length=80),
    actor_email: str | None = Query(None, max_length=255),
    target_id: str | None = Query(None, max_length=80),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[AuditLog]:
    q = db.query(AuditLog)
    if action:
        q = q.filter(AuditLog.action == action)
    if actor_email:
        q = q.filter(AuditLog.actor_email == actor_email.lower())
    if target_id:
        q = q.filter(AuditLog.target_id == target_id)
    return q.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_firm_access
from app.database import get_db
from app.models import Asset, Ticket, User
from app.schemas import TicketCreated
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

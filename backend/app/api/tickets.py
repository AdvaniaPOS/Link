"""Ticket listing + retry, scoped per firm."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_firm_access
from app.database import get_db
from app.models import Asset, Ticket, TicketStatus, User, UserRole
from app.schemas import TicketOut
from app.workers.tasks import send_resend_email

router = APIRouter(prefix="/admin", tags=["admin:tickets"])


@router.get("/firms/{firm_id}/tickets", response_model=list[TicketOut])
def list_firm_tickets(
    firm_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(100, ge=1, le=500),
) -> list[Ticket]:
    require_firm_access(firm_id, user)
    q = (
        db.query(Ticket)
        .join(Asset, Asset.id == Ticket.asset_id)
        .filter(Asset.firm_id == firm_id)
        .order_by(Ticket.created_at.desc())
    )
    if status_filter:
        q = q.filter(Ticket.status == TicketStatus(status_filter))
    return q.limit(limit).all()


@router.get("/tickets", response_model=list[TicketOut])
def list_all_tickets(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(200, ge=1, le=1000),
) -> list[Ticket]:
    """Super-admin only: cross-firm ticket feed."""
    if user.role != UserRole.super_admin:
        raise HTTPException(status_code=403, detail="Super admin required")
    q = db.query(Ticket).order_by(Ticket.created_at.desc())
    if status_filter:
        q = q.filter(Ticket.status == TicketStatus(status_filter))
    return q.limit(limit).all()


@router.post("/tickets/{ticket_id}/retry", response_model=TicketOut)
def retry_ticket(
    ticket_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Ticket:
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    asset = db.query(Asset).filter(Asset.id == ticket.asset_id).first()
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    require_firm_access(asset.firm_id, user)

    ticket.status = TicketStatus.pending
    ticket.last_error = None
    db.commit()
    db.refresh(ticket)
    send_resend_email.delay(str(ticket.id))
    return ticket

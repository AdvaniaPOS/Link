import enum
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.db_types import UUIDType


class TicketStatus(str, enum.Enum):
    pending = "pending"
    sent = "sent"
    failed = "failed"


class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    asset_id: Mapped[UUID] = mapped_column(
        UUIDType, ForeignKey("assets.id", ondelete="CASCADE"), nullable=False
    )

    customer_name: Mapped[str | None] = mapped_column(String(200))
    customer_email: Mapped[str] = mapped_column(String(255), nullable=False)
    customer_phone: Mapped[str | None] = mapped_column(String(50))
    contact_preference: Mapped[str] = mapped_column(
        String(16), default="email", server_default="email", nullable=False
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    attachment_url: Mapped[str | None] = mapped_column(String(1000))

    status: Mapped[TicketStatus] = mapped_column(
        Enum(TicketStatus, name="ticket_status"),
        default=TicketStatus.pending,
        nullable=False,
        index=True,
    )
    last_error: Mapped[str | None] = mapped_column(Text)
    resend_message_id: Mapped[str | None] = mapped_column(String(200))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    asset: Mapped["Asset"] = relationship(back_populates="tickets")  # noqa: F821

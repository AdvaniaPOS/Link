from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.db_types import UUIDType


class Asset(Base):
    __tablename__ = "assets"
    __table_args__ = (UniqueConstraint("firm_id", "serial_number", name="uq_asset_firm_serial"),)

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    firm_id: Mapped[UUID] = mapped_column(
        UUIDType, ForeignKey("firms.id", ondelete="CASCADE"), nullable=False
    )
    firm_product_id: Mapped[UUID] = mapped_column(
        UUIDType, ForeignKey("firm_products.id", ondelete="RESTRICT"), nullable=False
    )
    serial_number: Mapped[str] = mapped_column(String(100), nullable=False)
    location: Mapped[str | None] = mapped_column(String(200))
    # Optional per-asset Discord webhook override. When set, takes precedence
    # over firm.discord_webhook_url. Only used when firm.discord_enabled is True.
    discord_webhook_url: Mapped[str | None] = mapped_column(String(500))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    firm: Mapped["Firm"] = relationship(back_populates="assets")  # noqa: F821
    firm_product: Mapped["FirmProduct"] = relationship(back_populates="assets")  # noqa: F821
    tickets: Mapped[list["Ticket"]] = relationship(  # noqa: F821
        back_populates="asset", cascade="all, delete-orphan"
    )

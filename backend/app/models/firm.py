from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.db_types import UUIDType


class Firm(Base):
    __tablename__ = "firms"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    brand_color: Mapped[str] = mapped_column(String(9), nullable=False, default="#0F172A")
    logo_url: Mapped[str | None] = mapped_column(String(500))
    support_email_target: Mapped[str] = mapped_column(String(255), nullable=False)

    # Customer-facing footer fields shown on the public product page.
    footer_address: Mapped[str | None] = mapped_column(String(300))
    footer_phone: Mapped[str | None] = mapped_column(String(50))
    footer_email: Mapped[str | None] = mapped_column(String(255))
    footer_website: Mapped[str | None] = mapped_column(String(300))

    # Discord notification feature (opt-in per firm).
    discord_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    discord_webhook_url: Mapped[str | None] = mapped_column(String(500))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    firm_products: Mapped[list["FirmProduct"]] = relationship(  # noqa: F821
        back_populates="firm", cascade="all, delete-orphan"
    )
    assets: Mapped[list["Asset"]] = relationship(  # noqa: F821
        back_populates="firm", cascade="all, delete-orphan"
    )

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.db_types import UUIDType


class Accessory(Base):
    """An accessory or consumable that customers can order from a product page.

    `firm_product_id` may be null, in which case the accessory is offered for
    every product in the firm (e.g. generic cleaning kit). When set, only that
    product page surfaces it.
    """

    __tablename__ = "accessories"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    firm_id: Mapped[UUID] = mapped_column(
        UUIDType, ForeignKey("firms.id", ondelete="CASCADE"), nullable=False
    )
    firm_product_id: Mapped[UUID | None] = mapped_column(
        UUIDType, ForeignKey("firm_products.id", ondelete="CASCADE")
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    sku: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(2000))
    image_url: Mapped[str | None] = mapped_column(String(500))
    price_label: Mapped[str | None] = mapped_column(String(50))
    unit: Mapped[str | None] = mapped_column(String(40))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, server_default="1", nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    firm: Mapped["Firm"] = relationship()  # noqa: F821
    firm_product: Mapped["FirmProduct | None"] = relationship()  # noqa: F821


class AccessoryOrder(Base):
    __tablename__ = "accessory_orders"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    asset_id: Mapped[UUID] = mapped_column(
        UUIDType, ForeignKey("assets.id", ondelete="CASCADE"), nullable=False
    )
    accessory_id: Mapped[UUID] = mapped_column(
        UUIDType, ForeignKey("accessories.id", ondelete="RESTRICT"), nullable=False
    )

    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    customer_name: Mapped[str | None] = mapped_column(String(200))
    customer_email: Mapped[str] = mapped_column(String(255), nullable=False)
    customer_phone: Mapped[str | None] = mapped_column(String(50))
    note: Mapped[str | None] = mapped_column(Text)

    status: Mapped[str] = mapped_column(
        String(16), default="pending", server_default="pending", nullable=False, index=True
    )
    last_error: Mapped[str | None] = mapped_column(Text)
    resend_message_id: Mapped[str | None] = mapped_column(String(200))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    asset: Mapped["Asset"] = relationship()  # noqa: F821
    accessory: Mapped["Accessory"] = relationship()

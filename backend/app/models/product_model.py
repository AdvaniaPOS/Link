from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.db_types import UUIDType


class ProductModel(Base):
    __tablename__ = "product_models"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    firm_id: Mapped[UUID] = mapped_column(
        UUIDType, ForeignKey("firms.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    sku: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(2000))
    image_url: Mapped[str | None] = mapped_column(String(500))

    # Template metadata - decides which icon/group the asset uses on the
    # "Velg mal" gallery in the admin portal.
    category: Mapped[str] = mapped_column(
        String(40), default="other", server_default="other", nullable=False
    )

    # Customer-facing resources (PDF / web links).
    manual_url: Mapped[str | None] = mapped_column(String(500))
    quick_guide_url: Mapped[str | None] = mapped_column(String(500))
    warranty_url: Mapped[str | None] = mapped_column(String(500))
    warranty_text: Mapped[str | None] = mapped_column(String(4000))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    firm: Mapped["Firm"] = relationship(back_populates="product_models")  # noqa: F821
    assets: Mapped[list["Asset"]] = relationship(  # noqa: F821
        back_populates="product_model", cascade="all, delete-orphan"
    )

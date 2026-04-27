"""Global product catalog + firm-level product subscriptions with overrides.

Architecture:
- `ProductCatalog`: super-admin maintained global product types (e.g. "aPOS 16\"").
- `FirmProduct`: a firm's subscription to one catalog entry. Optional per-firm
  overrides for description, manual_url, quick_guide_url, warranty_url,
  warranty_text. NULL override = inherit from catalog.

Assets and accessories link to `FirmProduct` (not the catalog directly), so each
firm's instances stay isolated even though they share a global product type.
"""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.db_types import UUIDType


class ProductCatalog(Base):
    __tablename__ = "product_catalog"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    sku: Mapped[str | None] = mapped_column(String(100))
    category: Mapped[str] = mapped_column(
        String(40), default="other", server_default="other", nullable=False
    )
    image_url: Mapped[str | None] = mapped_column(String(500))

    # Optional decorative background for the public product page.
    # ``background_kind`` is "image" or "video".
    background_url: Mapped[str | None] = mapped_column(String(500))
    background_kind: Mapped[str] = mapped_column(
        String(10), default="image", server_default="image", nullable=False
    )

    # Default content firms inherit unless overridden.
    description: Mapped[str | None] = mapped_column(String(2000))
    manual_url: Mapped[str | None] = mapped_column(String(500))
    quick_guide_url: Mapped[str | None] = mapped_column(String(500))
    warranty_url: Mapped[str | None] = mapped_column(String(500))
    warranty_text: Mapped[str | None] = mapped_column(String(4000))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    firm_products: Mapped[list["FirmProduct"]] = relationship(
        back_populates="catalog", cascade="all, delete-orphan"
    )


class FirmProduct(Base):
    """A firm's subscription to a catalog product, with optional overrides."""

    __tablename__ = "firm_products"
    __table_args__ = (
        UniqueConstraint("firm_id", "catalog_id", name="uq_firm_products_firm_catalog"),
    )

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    firm_id: Mapped[UUID] = mapped_column(
        UUIDType, ForeignKey("firms.id", ondelete="CASCADE"), nullable=False
    )
    catalog_id: Mapped[UUID] = mapped_column(
        UUIDType, ForeignKey("product_catalog.id", ondelete="RESTRICT"), nullable=False
    )

    # Per-firm overrides. NULL = inherit from catalog.
    description: Mapped[str | None] = mapped_column(String(2000))
    manual_url: Mapped[str | None] = mapped_column(String(500))
    quick_guide_url: Mapped[str | None] = mapped_column(String(500))
    warranty_url: Mapped[str | None] = mapped_column(String(500))
    warranty_text: Mapped[str | None] = mapped_column(String(4000))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    firm: Mapped["Firm"] = relationship(back_populates="firm_products")  # noqa: F821
    catalog: Mapped["ProductCatalog"] = relationship(back_populates="firm_products")
    assets: Mapped[list["Asset"]] = relationship(  # noqa: F821
        back_populates="firm_product", cascade="all, delete-orphan"
    )

    # ---- helpers: effective (merged) values ----

    @property
    def name(self) -> str:
        return self.catalog.name

    @property
    def sku(self) -> str | None:
        return self.catalog.sku

    @property
    def category(self) -> str:
        return self.catalog.category

    @property
    def image_url(self) -> str | None:
        return self.catalog.image_url

    @property
    def background_url(self) -> str | None:
        return self.catalog.background_url

    @property
    def background_kind(self) -> str:
        return self.catalog.background_kind

    @property
    def effective_description(self) -> str | None:
        return self.description if self.description is not None else self.catalog.description

    @property
    def effective_manual_url(self) -> str | None:
        return self.manual_url if self.manual_url is not None else self.catalog.manual_url

    @property
    def effective_quick_guide_url(self) -> str | None:
        return (
            self.quick_guide_url
            if self.quick_guide_url is not None
            else self.catalog.quick_guide_url
        )

    @property
    def effective_warranty_url(self) -> str | None:
        return self.warranty_url if self.warranty_url is not None else self.catalog.warranty_url

    @property
    def effective_warranty_text(self) -> str | None:
        return self.warranty_text if self.warranty_text is not None else self.catalog.warranty_text

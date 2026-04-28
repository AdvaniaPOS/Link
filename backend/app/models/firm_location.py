"""Predefined locations per firm.

Used at festival/events to quickly set ``Asset.location`` from a small list
of known places (e.g. "Hovedscene", "Bar 1"). Each location may have a
Discord role id so that quick-support / ticket notifications can mention the
on-site team responsible for that area instead of the generic ``@here``.
"""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.db_types import UUIDType


class FirmLocation(Base):
    __tablename__ = "firm_locations"
    __table_args__ = (
        UniqueConstraint("firm_id", "name", name="uq_firm_locations_firm_name"),
    )

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    firm_id: Mapped[UUID] = mapped_column(
        UUIDType, ForeignKey("firms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # Optional Discord role id (snowflake) to mention when this location's
    # assets generate notifications. Stored as string to preserve precision.
    discord_role_id: Mapped[str | None] = mapped_column(String(40))
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    firm: Mapped["Firm"] = relationship()  # noqa: F821

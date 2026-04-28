"""Many-to-many link between users and firms.

A user's primary firm is still ``User.firm_id``. Memberships add *additional*
firms the same login can switch to (festival operators often handle several
firms with one email).
"""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.db_types import UUIDType


class FirmMembership(Base):
    __tablename__ = "firm_memberships"
    __table_args__ = (UniqueConstraint("user_id", "firm_id", name="uq_firm_memberships_user_firm"),)

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    firm_id: Mapped[UUID] = mapped_column(
        UUIDType, ForeignKey("firms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    user: Mapped["User"] = relationship(back_populates="memberships")  # noqa: F821
    firm: Mapped["Firm"] = relationship()  # noqa: F821

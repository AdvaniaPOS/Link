import enum
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.db_types import UUIDType


class UserRole(str, enum.Enum):  # noqa: UP042 - keep str+Enum for stable serialization
    super_admin = "super_admin"
    firm_admin = "firm_admin"


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(UUIDType, primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(200))
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role"), nullable=False, default=UserRole.firm_admin
    )
    firm_id: Mapped[UUID | None] = mapped_column(
        UUIDType, ForeignKey("firms.id", ondelete="CASCADE"), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    firm: Mapped["Firm | None"] = relationship()  # noqa: F821

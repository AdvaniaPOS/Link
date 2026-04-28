from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class FirmPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    brand_color: str
    logo_url: str | None = None
    footer_address: str | None = None
    footer_phone: str | None = None
    footer_email: str | None = None
    footer_website: str | None = None


class ProductModelPublic(BaseModel):
    """Customer-facing effective product info (catalog + firm overrides merged)."""

    id: UUID
    name: str
    sku: str | None = None
    description: str | None = None
    image_url: str | None = None
    category: str = "other"
    background_url: str | None = None
    background_kind: str = "image"
    manual_url: str | None = None
    quick_guide_url: str | None = None
    warranty_url: str | None = None
    warranty_text: str | None = None


class AssetPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    serial_number: str
    location: str | None = None
    quick_support_enabled: bool = False
    firm: FirmPublic
    product_model: ProductModelPublic


class SupportTicketIn(BaseModel):
    customer_name: str = Field(..., min_length=1, max_length=200)
    customer_email: EmailStr
    customer_phone: str | None = Field(None, max_length=50)
    contact_preference: Literal["email", "phone"] = "email"
    message: str = Field(..., min_length=1, max_length=5000)
    attachment_url: str | None = Field(None, max_length=1000)


class TicketCreated(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: str


# ---------- auth ----------


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    full_name: str | None = None
    role: str
    firm_id: UUID | None = None
    is_active: bool
    created_at: datetime
    totp_enabled: bool = False


class UserCreateIn(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str | None = Field(None, max_length=200)
    role: str = Field("firm_admin", pattern="^(super_admin|firm_admin)$")
    firm_id: UUID | None = None


class UserUpdateIn(BaseModel):
    full_name: str | None = None
    password: str | None = Field(None, min_length=8, max_length=128)
    is_active: bool | None = None


class ChangePasswordIn(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=10, max_length=128)


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str = Field(..., min_length=10, max_length=200)
    new_password: str = Field(..., min_length=10, max_length=128)


class TotpSetupOut(BaseModel):
    secret: str
    otpauth_url: str


class TotpVerifyIn(BaseModel):
    code: str = Field(..., min_length=6, max_length=10)


class TotpDisableIn(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    actor_user_id: UUID | None = None
    actor_email: str | None = None
    action: str
    target_type: str | None = None
    target_id: str | None = None
    ip: str | None = None
    user_agent: str | None = None
    extra: dict | None = None
    created_at: datetime


# ---------- management: firms ----------


class FirmIn(BaseModel):
    name: str = Field(..., max_length=200)
    brand_color: str = Field("#0F172A", max_length=9)
    logo_url: str | None = Field(None, max_length=500)
    support_email_target: EmailStr
    footer_address: str | None = Field(None, max_length=300)
    footer_phone: str | None = Field(None, max_length=50)
    footer_email: EmailStr | None = None
    footer_website: str | None = Field(None, max_length=300)
    discord_enabled: bool = False
    discord_webhook_url: str | None = Field(None, max_length=500)


class FirmUpdateIn(BaseModel):
    name: str | None = Field(None, max_length=200)
    brand_color: str | None = Field(None, max_length=9)
    logo_url: str | None = Field(None, max_length=500)
    support_email_target: EmailStr | None = None
    footer_address: str | None = Field(None, max_length=300)
    footer_phone: str | None = Field(None, max_length=50)
    footer_email: EmailStr | None = None
    footer_website: str | None = Field(None, max_length=300)
    discord_enabled: bool | None = None
    discord_webhook_url: str | None = Field(None, max_length=500)


class FirmOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    brand_color: str
    logo_url: str | None = None
    support_email_target: EmailStr
    footer_address: str | None = None
    footer_phone: str | None = None
    footer_email: EmailStr | None = None
    footer_website: str | None = None
    discord_enabled: bool = False
    discord_webhook_url: str | None = None
    created_at: datetime


# ---------- management: product catalog (super-admin) ----------


class CatalogIn(BaseModel):
    name: str = Field(..., max_length=200)
    sku: str | None = Field(None, max_length=100)
    category: str = Field("other", max_length=40)
    image_url: str | None = Field(None, max_length=500)
    background_url: str | None = Field(None, max_length=500)
    background_kind: Literal["image", "video"] = "image"
    description: str | None = Field(None, max_length=2000)
    manual_url: str | None = Field(None, max_length=500)
    quick_guide_url: str | None = Field(None, max_length=500)
    warranty_url: str | None = Field(None, max_length=500)
    warranty_text: str | None = Field(None, max_length=4000)
    # Optional: super-admin can set to a firm id to make this a firm-private
    # product. firm_admin must set this to one of their own firms.
    owner_firm_id: UUID | None = None


class CatalogUpdateIn(BaseModel):
    name: str | None = Field(None, max_length=200)
    sku: str | None = Field(None, max_length=100)
    category: str | None = Field(None, max_length=40)
    image_url: str | None = Field(None, max_length=500)
    background_url: str | None = Field(None, max_length=500)
    background_kind: Literal["image", "video"] | None = None
    description: str | None = Field(None, max_length=2000)
    manual_url: str | None = Field(None, max_length=500)
    quick_guide_url: str | None = Field(None, max_length=500)
    warranty_url: str | None = Field(None, max_length=500)
    warranty_text: str | None = Field(None, max_length=4000)


class CatalogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    owner_firm_id: UUID | None = None
    name: str
    sku: str | None = None
    category: str = "other"
    image_url: str | None = None
    background_url: str | None = None
    background_kind: str = "image"
    description: str | None = None
    manual_url: str | None = None
    quick_guide_url: str | None = None
    warranty_url: str | None = None
    warranty_text: str | None = None
    created_at: datetime


# ---------- management: firm product subscriptions ----------


class FirmProductLinkIn(BaseModel):
    """Subscribe a firm to a catalog product (no overrides yet)."""

    catalog_id: UUID


class FirmProductOverrideIn(BaseModel):
    """Update overrides only. NULL = inherit from catalog.

    Only the 5 overridable fields are accepted.
    """

    description: str | None = Field(None, max_length=2000)
    manual_url: str | None = Field(None, max_length=500)
    quick_guide_url: str | None = Field(None, max_length=500)
    warranty_url: str | None = Field(None, max_length=500)
    warranty_text: str | None = Field(None, max_length=4000)


class ProductModelOut(BaseModel):
    """Effective product view returned to firm-admin and used by frontend.

    Shape mirrors the legacy ProductModelOut so existing UI keeps working;
    `id` is the FirmProduct id and the content fields are merged from
    catalog + firm overrides.
    """

    id: UUID  # firm_product.id
    firm_id: UUID
    catalog_id: UUID
    name: str
    sku: str | None = None
    description: str | None = None
    image_url: str | None = None
    category: str = "other"
    background_url: str | None = None
    background_kind: str = "image"
    manual_url: str | None = None
    quick_guide_url: str | None = None
    warranty_url: str | None = None
    warranty_text: str | None = None
    # Override metadata (which fields are firm-specific vs inherited).
    overrides: dict[str, str | None] = Field(default_factory=dict)
    created_at: datetime


# ---------- management: assets ----------


class AssetIn(BaseModel):
    firm_product_id: UUID
    serial_number: str = Field(..., max_length=100)
    location: str | None = Field(None, max_length=200)
    discord_webhook_url: str | None = Field(None, max_length=500)
    quick_support_enabled: bool = False


class AssetUpdateIn(BaseModel):
    firm_product_id: UUID | None = None
    serial_number: str | None = Field(None, max_length=100)
    location: str | None = Field(None, max_length=200)
    discord_webhook_url: str | None = Field(None, max_length=500)
    quick_support_enabled: bool | None = None


class AssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    firm_id: UUID
    firm_product_id: UUID
    serial_number: str
    location: str | None = None
    discord_webhook_url: str | None = None
    quick_support_enabled: bool = False
    created_at: datetime


# ---------- management: firm locations ----------


class FirmLocationIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    discord_role_id: str | None = Field(None, max_length=40, pattern=r"^\d{1,40}$")
    sort_order: int = 0


class FirmLocationUpdateIn(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    discord_role_id: str | None = Field(None, max_length=40)
    sort_order: int | None = None


class FirmLocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    firm_id: UUID
    name: str
    discord_role_id: str | None = None
    sort_order: int = 0
    created_at: datetime


# ---------- management: firm memberships / multi-firm switcher ----------


class MeFirmOut(BaseModel):
    """A firm the current user can act in (primary or via membership)."""

    id: UUID
    name: str
    is_primary: bool = False


class FirmMembershipOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    firm_id: UUID
    created_at: datetime


class FirmMembershipIn(BaseModel):
    firm_id: UUID


# ---------- management: tickets ----------


class TicketOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    asset_id: UUID
    customer_name: str | None = None
    customer_email: EmailStr
    customer_phone: str | None = None
    contact_preference: str = "email"
    message: str
    attachment_url: str | None = None
    status: str
    last_error: str | None = None
    resend_message_id: str | None = None
    created_at: datetime
    sent_at: datetime | None = None


# ---------- accessories ----------


class AccessoryPublic(BaseModel):
    """Customer-facing accessory shape (returned from /api/p/{uuid}/accessories)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    sku: str | None = None
    description: str | None = None
    image_url: str | None = None
    price_label: str | None = None
    unit: str | None = None


class AccessoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    firm_id: UUID
    firm_product_id: UUID | None = None
    name: str
    sku: str | None = None
    description: str | None = None
    image_url: str | None = None
    price_label: str | None = None
    unit: str | None = None
    sort_order: int = 0
    is_active: bool = True
    created_at: datetime


class AccessoryIn(BaseModel):
    name: str = Field(..., max_length=200)
    sku: str | None = Field(None, max_length=100)
    description: str | None = Field(None, max_length=2000)
    image_url: str | None = Field(None, max_length=500)
    price_label: str | None = Field(None, max_length=50)
    unit: str | None = Field(None, max_length=40)
    firm_product_id: UUID | None = None
    sort_order: int = 0
    is_active: bool = True


class AccessoryUpdateIn(BaseModel):
    name: str | None = Field(None, max_length=200)
    sku: str | None = Field(None, max_length=100)
    description: str | None = Field(None, max_length=2000)
    image_url: str | None = Field(None, max_length=500)
    price_label: str | None = Field(None, max_length=50)
    unit: str | None = Field(None, max_length=40)
    firm_product_id: UUID | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class AccessoryOrderIn(BaseModel):
    accessory_id: UUID
    quantity: int = Field(1, ge=1, le=999)
    customer_name: str = Field(..., min_length=1, max_length=200)
    customer_email: EmailStr
    customer_phone: str | None = Field(None, max_length=50)
    note: str | None = Field(None, max_length=2000)


class AccessoryOrderCreated(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: str


class AccessoryOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    asset_id: UUID
    accessory_id: UUID
    quantity: int
    customer_name: str | None = None
    customer_email: EmailStr
    customer_phone: str | None = None
    note: str | None = None
    status: str
    last_error: str | None = None
    resend_message_id: str | None = None
    created_at: datetime
    sent_at: datetime | None = None

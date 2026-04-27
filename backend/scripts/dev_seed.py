"""Dev bootstrap: create tables (no Alembic) and seed a demo Firm/ProductModel/Asset.

Usage:
    python -m scripts.dev_seed
"""

from __future__ import annotations

from app.auth import hash_password
from app.database import Base, SessionLocal, engine
from app import models  # noqa: F401  – ensure model classes register with metadata
from app.models import Asset, Firm, FirmProduct, ProductCatalog, User, UserRole


def main() -> None:
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        firm = db.query(Firm).filter(Firm.name == "Betala AS").first()
        if firm is None:
            firm = Firm(
                name="Betala AS",
                brand_color="#4F46E5",
                logo_url=None,
                support_email_target="jon.vidar.sigurdarson@gmail.com",
            )
            db.add(firm)
            db.flush()

        catalog = (
            db.query(ProductCatalog)
            .filter(ProductCatalog.name == "Betala v3 Terminal")
            .first()
        )
        if catalog is None:
            catalog = ProductCatalog(
                name="Betala v3 Terminal",
                sku="BTL-V3",
                category="terminal",
                description="Betala betalingsterminal v3 – demo-modell.",
            )
            db.add(catalog)
            db.flush()

        firm_product = (
            db.query(FirmProduct)
            .filter(FirmProduct.firm_id == firm.id, FirmProduct.catalog_id == catalog.id)
            .first()
        )
        if firm_product is None:
            firm_product = FirmProduct(firm_id=firm.id, catalog_id=catalog.id)
            db.add(firm_product)
            db.flush()

        asset = (
            db.query(Asset)
            .filter(Asset.firm_id == firm.id, Asset.serial_number == "DEMO-0001")
            .first()
        )
        if asset is None:
            asset = Asset(
                firm_id=firm.id,
                firm_product_id=firm_product.id,
                serial_number="DEMO-0001",
                location="Test-benk",
            )
            db.add(asset)
            db.flush()

        super_admin = db.query(User).filter(User.email == "super@betala.link").first()
        if super_admin is None:
            super_admin = User(
                email="super@betala.link",
                password_hash=hash_password("changeme123"),
                full_name="Super Admin",
                role=UserRole.super_admin,
                firm_id=None,
            )
            db.add(super_admin)

        firm_admin = db.query(User).filter(User.email == "admin@betala.link").first()
        if firm_admin is None:
            firm_admin = User(
                email="admin@betala.link",
                password_hash=hash_password("changeme123"),
                full_name="Betala Firm Admin",
                role=UserRole.firm_admin,
                firm_id=firm.id,
            )
            db.add(firm_admin)

        db.commit()

        print("Seed OK")
        print(f"  Firm:    {firm.id}  {firm.name}")
        print(f"  Product: {firm_product.id}  {catalog.name}")
        print(f"  Asset:   {asset.id}  ({asset.serial_number})")
        print()
        print("Logins (passord: changeme123):")
        print("  super@betala.link   (super_admin)")
        print("  admin@betala.link   (firm_admin – Betala AS)")
        print()
        print(f"Kundevisning: http://localhost:51730/p/{asset.id}")
        print("Admin-portal: http://localhost:51730/admin")
    finally:
        db.close()


if __name__ == "__main__":
    main()

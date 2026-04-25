"""Migrate from per-firm `product_models` to global `product_catalog` + `firm_products`.

What it does:
  1. Snapshots existing tables (product_models, assets, accessories, accessory_orders, tickets).
  2. Drops dependent tables in FK-safe order.
  3. Recreates schema via Base.metadata.create_all (gives us the new shape).
  4. Dedupes existing product_models by (lower(name), lower(coalesce(sku,''))) into
     ProductCatalog rows. All original field values are preserved as per-firm overrides
     in FirmProduct so existing customer pages keep showing the same content.
  5. Re-inserts assets (FK -> firm_products), accessories (FK -> firm_products|null),
     tickets, and accessory_orders, preserving IDs.

Idempotent: safe to re-run on a fresh DB (no-ops if old tables don't exist).
"""

from __future__ import annotations

import sys
import sqlite3
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.database import Base, engine  # noqa: E402
import app.models  # noqa: E402,F401  - register all models on Base


DB_PATH = ROOT / "betala.db"


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    cur = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    )
    return cur.fetchone() is not None


def _columns(conn: sqlite3.Connection, table: str) -> list[str]:
    return [row[1] for row in conn.execute(f"PRAGMA table_info({table})")]


def main() -> None:
    raw = sqlite3.connect(str(DB_PATH))
    raw.row_factory = sqlite3.Row

    # --- snapshot ---
    has_old = _table_exists(raw, "product_models") and "firm_id" in _columns(
        raw, "product_models"
    )
    if not has_old:
        # New schema already in place; just ensure tables exist and exit.
        Base.metadata.create_all(bind=engine)
        print("No legacy product_models table found - schema only ensured.")
        raw.close()
        return

    pms = [dict(r) for r in raw.execute("SELECT * FROM product_models").fetchall()]
    assets = [dict(r) for r in raw.execute("SELECT * FROM assets").fetchall()]
    accessories = (
        [dict(r) for r in raw.execute("SELECT * FROM accessories").fetchall()]
        if _table_exists(raw, "accessories")
        else []
    )
    accessory_orders = (
        [dict(r) for r in raw.execute("SELECT * FROM accessory_orders").fetchall()]
        if _table_exists(raw, "accessory_orders")
        else []
    )
    tickets = [dict(r) for r in raw.execute("SELECT * FROM tickets").fetchall()]

    print(
        f"Snapshot: {len(pms)} product_models, {len(assets)} assets, "
        f"{len(accessories)} accessories, {len(accessory_orders)} orders, "
        f"{len(tickets)} tickets"
    )

    # --- drop in FK-safe order ---
    raw.execute("PRAGMA foreign_keys = OFF")
    for t in (
        "accessory_orders",
        "accessories",
        "tickets",
        "assets",
        "product_models",
    ):
        raw.execute(f"DROP TABLE IF EXISTS {t}")
    raw.commit()
    raw.close()

    # --- recreate schema ---
    # Drop ORM-side caches for safety, then create_all.
    Base.metadata.create_all(bind=engine)
    print("Schema rebuilt (product_catalog, firm_products, assets, accessories, ...).")

    # --- dedupe + re-insert ---
    raw = sqlite3.connect(str(DB_PATH))
    raw.row_factory = sqlite3.Row

    # Build catalog dedup map: key -> catalog_id
    catalog_key_to_id: dict[tuple[str, str], str] = {}
    # Build firm_product map: old_pm_id -> new firm_product_id
    pm_to_fp: dict[str, str] = {}

    for pm in pms:
        key = (
            (pm["name"] or "").strip().lower(),
            (pm["sku"] or "").strip().lower(),
        )
        catalog_id = catalog_key_to_id.get(key)
        if catalog_id is None:
            catalog_id = uuid4().hex
            catalog_key_to_id[key] = catalog_id
            raw.execute(
                """INSERT INTO product_catalog
                   (id, name, sku, category, image_url, description,
                    manual_url, quick_guide_url, warranty_url, warranty_text,
                    created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))""",
                (
                    catalog_id,
                    pm["name"],
                    pm["sku"],
                    pm.get("category") or "other",
                    pm.get("image_url"),
                    pm.get("description"),
                    pm.get("manual_url"),
                    pm.get("quick_guide_url"),
                    pm.get("warranty_url"),
                    pm.get("warranty_text"),
                    pm.get("created_at"),
                ),
            )

        # Always create a FirmProduct row preserving this firm's exact values as overrides.
        fp_id = uuid4().hex
        pm_to_fp[pm["id"]] = fp_id
        raw.execute(
            """INSERT INTO firm_products
               (id, firm_id, catalog_id, description, manual_url,
                quick_guide_url, warranty_url, warranty_text, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))""",
            (
                fp_id,
                pm["firm_id"],
                catalog_id,
                pm.get("description"),
                pm.get("manual_url"),
                pm.get("quick_guide_url"),
                pm.get("warranty_url"),
                pm.get("warranty_text"),
                pm.get("created_at"),
            ),
        )

    print(
        f"Created {len(catalog_key_to_id)} catalog row(s) (deduped from {len(pms)}), "
        f"{len(pm_to_fp)} firm_product row(s)."
    )

    # Re-insert assets with new firm_product_id.
    for a in assets:
        fp_id = pm_to_fp.get(a["product_model_id"])
        if fp_id is None:
            print(f"  WARN: skipping asset {a['id']} (orphan product_model_id)")
            continue
        raw.execute(
            """INSERT INTO assets
               (id, firm_id, firm_product_id, serial_number, location, created_at)
               VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))""",
            (
                a["id"],
                a["firm_id"],
                fp_id,
                a["serial_number"],
                a.get("location"),
                a.get("created_at"),
            ),
        )

    # Re-insert accessories.
    for ac in accessories:
        old_pm = ac.get("product_model_id")
        new_fp = pm_to_fp.get(old_pm) if old_pm else None
        raw.execute(
            """INSERT INTO accessories
               (id, firm_id, firm_product_id, name, sku, description, image_url,
                price_label, unit, sort_order, is_active, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))""",
            (
                ac["id"],
                ac["firm_id"],
                new_fp,
                ac["name"],
                ac.get("sku"),
                ac.get("description"),
                ac.get("image_url"),
                ac.get("price_label"),
                ac.get("unit"),
                ac.get("sort_order", 0),
                ac.get("is_active", 1),
                ac.get("created_at"),
            ),
        )

    # Re-insert tickets (no schema change).
    for t in tickets:
        cols = list(t.keys())
        placeholders = ",".join(["?"] * len(cols))
        raw.execute(
            f"INSERT INTO tickets ({','.join(cols)}) VALUES ({placeholders})",
            tuple(t[c] for c in cols),
        )

    # Re-insert accessory_orders (no schema change).
    for o in accessory_orders:
        cols = list(o.keys())
        placeholders = ",".join(["?"] * len(cols))
        raw.execute(
            f"INSERT INTO accessory_orders ({','.join(cols)}) VALUES ({placeholders})",
            tuple(o[c] for c in cols),
        )

    raw.execute("PRAGMA foreign_keys = ON")
    raw.commit()
    raw.close()
    print("Migration complete.")


if __name__ == "__main__":
    main()

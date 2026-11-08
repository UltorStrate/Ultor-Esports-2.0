-- ULTOR ESPORTS CMS — Printful product mapping
-- Links internal shop products and variants to Printful Sync Store records.

CREATE TABLE IF NOT EXISTS shop_printful_product_map (
  shop_product_id TEXT PRIMARY KEY,
  printful_sync_product_id INTEGER NOT NULL UNIQUE,
  printful_external_id TEXT,
  printful_product_json TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shop_product_id)
    REFERENCES shop_products(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shop_printful_variant_map (
  shop_variant_id TEXT PRIMARY KEY,
  printful_sync_variant_id INTEGER NOT NULL UNIQUE,
  printful_catalog_variant_id INTEGER,
  printful_variant_json TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shop_variant_id)
    REFERENCES shop_product_variants(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shop_printful_product_sync_id
  ON shop_printful_product_map (printful_sync_product_id);

CREATE INDEX IF NOT EXISTS idx_shop_printful_variant_sync_id
  ON shop_printful_variant_map (printful_sync_variant_id);

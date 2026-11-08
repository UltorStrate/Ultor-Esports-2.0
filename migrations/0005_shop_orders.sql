-- ULTOR ESPORTS — Order management foundation
-- Safe by default: no payment provider and no Printful order submission is triggered here.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS shop_orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  customer_email TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  shipping_cents INTEGER NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','pending','paid','failed','cancelled','refunded','partially_refunded')),
  fulfillment_status TEXT NOT NULL DEFAULT 'unfulfilled'
    CHECK (fulfillment_status IN ('unfulfilled','queued','submitted','in_production','shipped','delivered','failed','cancelled')),
  order_status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (order_status IN ('pending_payment','confirmed','processing','completed','cancelled','on_hold')),
  payment_provider TEXT,
  payment_reference TEXT,
  idempotency_key TEXT UNIQUE,
  customer_note TEXT,
  internal_note TEXT,
  shipping_name TEXT NOT NULL,
  shipping_company TEXT,
  shipping_address1 TEXT NOT NULL,
  shipping_address2 TEXT,
  shipping_city TEXT NOT NULL,
  shipping_state TEXT,
  shipping_postal_code TEXT NOT NULL,
  shipping_country_code TEXT NOT NULL,
  shipping_phone TEXT,
  billing_name TEXT,
  billing_company TEXT,
  billing_address1 TEXT,
  billing_address2 TEXT,
  billing_city TEXT,
  billing_state TEXT,
  billing_postal_code TEXT,
  billing_country_code TEXT,
  billing_tax_id TEXT,
  printful_order_id INTEGER UNIQUE,
  printful_external_id TEXT,
  tracking_number TEXT,
  tracking_url TEXT,
  shipped_at TEXT,
  paid_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shop_orders_created
  ON shop_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_orders_status
  ON shop_orders(order_status, payment_status);
CREATE INDEX IF NOT EXISTS idx_shop_orders_email
  ON shop_orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_shop_orders_fulfillment
  ON shop_orders(fulfillment_status);

CREATE TABLE IF NOT EXISTS shop_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  shop_product_id TEXT,
  shop_variant_id TEXT,
  printful_sync_variant_id INTEGER,
  product_name TEXT NOT NULL,
  variant_name TEXT,
  sku TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0),
  product_snapshot_json TEXT,
  variant_snapshot_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES shop_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (shop_product_id) REFERENCES shop_products(id) ON DELETE SET NULL,
  FOREIGN KEY (shop_variant_id) REFERENCES shop_product_variants(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_shop_order_items_order
  ON shop_order_items(order_id);

CREATE TABLE IF NOT EXISTS shop_order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  details_json TEXT,
  actor_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES shop_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_shop_order_events_order
  ON shop_order_events(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS shop_printful_fulfillments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  printful_order_id INTEGER UNIQUE,
  status TEXT NOT NULL DEFAULT 'not_submitted'
    CHECK (status IN ('not_submitted','submitting','submitted','in_production','shipped','failed','cancelled')),
  request_json TEXT,
  response_json TEXT,
  last_error TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_retry_at TEXT,
  submitted_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES shop_orders(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO permissions (id, name, description)
VALUES
  ('p32', 'shop.orders.view', 'Shopbestellungen ansehen'),
  ('p33', 'shop.orders.manage', 'Shopbestellungen verwalten');

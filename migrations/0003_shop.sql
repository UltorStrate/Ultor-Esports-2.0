
-- =========================================
-- ULTOR ESPORTS CMS
-- SHOP MANAGEMENT MIGRATION
-- =========================================

PRAGMA foreign_keys = ON;

-- =========================================
-- SHOP CATEGORIES
-- Supports unlimited nesting via parent_id
-- =========================================

CREATE TABLE IF NOT EXISTS shop_categories (
    id TEXT PRIMARY KEY,
    parent_id TEXT,

    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    image_key TEXT,

    sort_order INTEGER NOT NULL DEFAULT 0,

    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (parent_id)
        REFERENCES shop_categories(id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_shop_categories_parent
ON shop_categories(parent_id);

CREATE INDEX IF NOT EXISTS idx_shop_categories_status
ON shop_categories(status);

CREATE INDEX IF NOT EXISTS idx_shop_categories_sort
ON shop_categories(sort_order);


-- =========================================
-- SHOP PRODUCTS
-- =========================================

CREATE TABLE IF NOT EXISTS shop_products (
    id TEXT PRIMARY KEY,

    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,

    short_description TEXT,
    description TEXT,

    price_cents INTEGER
        CHECK (price_cents IS NULL OR price_cents >= 0),

    compare_at_price_cents INTEGER
        CHECK (
            compare_at_price_cents IS NULL
            OR compare_at_price_cents >= 0
        ),

    currency TEXT NOT NULL DEFAULT 'EUR',

    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'archived')),

    is_featured INTEGER NOT NULL DEFAULT 0
        CHECK (is_featured IN (0, 1)),

    sort_order INTEGER NOT NULL DEFAULT 0,

    created_by TEXT,
    updated_by TEXT,

    published_at TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_shop_products_status
ON shop_products(status);

CREATE INDEX IF NOT EXISTS idx_shop_products_featured
ON shop_products(is_featured);

CREATE INDEX IF NOT EXISTS idx_shop_products_sort
ON shop_products(sort_order);


-- =========================================
-- PRODUCT CATEGORY ASSIGNMENTS
-- Many-to-many relationship
-- =========================================

CREATE TABLE IF NOT EXISTS shop_product_categories (
    product_id TEXT NOT NULL,
    category_id TEXT NOT NULL,

    PRIMARY KEY (product_id, category_id),

    FOREIGN KEY (product_id)
        REFERENCES shop_products(id)
        ON DELETE CASCADE,

    FOREIGN KEY (category_id)
        REFERENCES shop_categories(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shop_product_categories_category
ON shop_product_categories(category_id);


-- =========================================
-- PRODUCT IMAGES
-- Images are stored in Cloudflare R2
-- =========================================

CREATE TABLE IF NOT EXISTS shop_product_images (
    id TEXT PRIMARY KEY,

    product_id TEXT NOT NULL,

    image_key TEXT NOT NULL,
    alt_text TEXT,

    sort_order INTEGER NOT NULL DEFAULT 0,

    is_primary INTEGER NOT NULL DEFAULT 0
        CHECK (is_primary IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (product_id)
        REFERENCES shop_products(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shop_product_images_product
ON shop_product_images(product_id);


-- =========================================
-- PRODUCT VARIANTS
-- Examples: Size, Color, Edition
-- =========================================

CREATE TABLE IF NOT EXISTS shop_product_variants (
    id TEXT PRIMARY KEY,

    product_id TEXT NOT NULL,

    variant_name TEXT NOT NULL,
    sku TEXT UNIQUE,

    option1_name TEXT,
    option1_value TEXT,

    option2_name TEXT,
    option2_value TEXT,

    option3_name TEXT,
    option3_value TEXT,

    price_cents INTEGER
        CHECK (price_cents IS NULL OR price_cents >= 0),

    compare_at_price_cents INTEGER
        CHECK (
            compare_at_price_cents IS NULL
            OR compare_at_price_cents >= 0
        ),

    stock_quantity INTEGER NOT NULL DEFAULT 0
        CHECK (stock_quantity >= 0),

    track_inventory INTEGER NOT NULL DEFAULT 1
        CHECK (track_inventory IN (0, 1)),

    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),

    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (product_id)
        REFERENCES shop_products(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shop_variants_product
ON shop_product_variants(product_id);

CREATE INDEX IF NOT EXISTS idx_shop_variants_status
ON shop_product_variants(status);


-- =========================================
-- SHOP PERMISSIONS
-- Existing CMS permission system is reused
-- =========================================

INSERT OR IGNORE INTO permissions
(id, name, description)
VALUES
('p25', 'shop.view', 'Shopverwaltung ansehen'),
('p26', 'shop.products.create', 'Shopprodukte erstellen'),
('p27', 'shop.products.edit', 'Shopprodukte bearbeiten'),
('p28', 'shop.products.delete', 'Shopprodukte löschen'),
('p29', 'shop.products.publish', 'Shopprodukte veröffentlichen'),
('p30', 'shop.categories.manage', 'Shopkategorien verwalten'),
('p31', 'shop.settings.manage', 'Shop-Einstellungen verwalten');



function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

async function getUser(request, env, auth) {
  const session = await auth.api.getSession({
    headers: request.headers
  });

  if (!session?.user) {
    return { error: json({ error: "Nicht angemeldet" }, 401) };
  }

  const user = await env.DB.prepare(`
    SELECT id, name, email, status, is_owner
    FROM users
    WHERE id = ?
  `).bind(session.user.id).first();

  if (!user || user.status !== "approved") {
    return { error: json({ error: "Zugriff nicht freigegeben" }, 403) };
  }

  const result = await env.DB.prepare(`
    SELECT p.name
    FROM user_permissions up
    JOIN permissions p ON p.id = up.permission_id
    WHERE up.user_id = ?
  `).bind(user.id).all();

  return {
    user,
    permissions: user.is_owner === 1
      ? ["*"]
      : result.results.map(row => row.name)
  };
}

function can(current, permission) {
  return current.user.is_owner === 1 ||
    current.permissions.includes("*") ||
    current.permissions.includes(permission);
}

async function audit(env, userId, action, entityId, details = null) {
  await env.DB.prepare(`
    INSERT INTO audit_logs (
      id, user_id, action, entity_type, entity_id, details
    )
    VALUES (?, ?, ?, 'shop', ?, ?)
  `).bind(
    crypto.randomUUID(),
    userId,
    action,
    entityId,
    details ? JSON.stringify(details) : null
  ).run();
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function validText(value, maxLength, required = false) {
  if (value === undefined || value === null) {
    return !required;
  }

  return typeof value === "string" &&
    (!required || Boolean(value.trim())) &&
    value.length <= maxLength;
}

function validPrice(value) {
  return value === null ||
    value === undefined ||
    (Number.isInteger(value) && value >= 0);
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function validId(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 100;
}

// =========================================
// KATEGORIEN
// =========================================

function validateCategory(body, partial = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Ungültige Anfrage.";
  }

  if (!partial || body.name !== undefined) {
    if (!validText(body.name, 120, true)) {
      return "Der Kategoriename muss zwischen 1 und 120 Zeichen lang sein.";
    }
  }

  if (body.description !== undefined &&
      !validText(body.description, 2000)) {
    return "Die Beschreibung darf maximal 2.000 Zeichen enthalten.";
  }

  if (body.parent_id !== undefined &&
      body.parent_id !== null &&
      !validId(body.parent_id)) {
    return "Ungültige übergeordnete Kategorie.";
  }

  if (body.sort_order !== undefined &&
      !Number.isInteger(body.sort_order)) {
    return "Ungültige Sortierung.";
  }

  if (body.status !== undefined &&
      !["active", "inactive"].includes(body.status)) {
    return "Ungültiger Kategorienstatus.";
  }

  return null;
}

async function createCategory(request, env, current) {
  if (!can(current, "shop.categories.manage")) {
    return json({ error: "Keine Berechtigung zum Verwalten von Kategorien." }, 403);
  }

  const body = await readBody(request);
  const error = validateCategory(body);

  if (error) return json({ error }, 400);

  const id = crypto.randomUUID();
  const slug = slugify(body.slug || body.name);

  if (!slug) return json({ error: "Ungültiger Kategorie-Slug." }, 400);

  if (body.parent_id) {
    const parent = await env.DB.prepare(`
      SELECT id FROM shop_categories WHERE id = ?
    `).bind(body.parent_id).first();

    if (!parent) {
      return json({ error: "Übergeordnete Kategorie nicht gefunden." }, 404);
    }
  }

  try {
    await env.DB.prepare(`
      INSERT INTO shop_categories (
        id, parent_id, name, slug, description, sort_order, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      body.parent_id || null,
      body.name.trim(),
      slug,
      body.description?.trim() || null,
      body.sort_order ?? 0,
      body.status || "active"
    ).run();
  } catch (error) {
    if (error.message?.includes("UNIQUE")) {
      return json({ error: "Dieser Kategorie-Slug ist bereits vergeben." }, 409);
    }
    throw error;
  }

  await audit(env, current.user.id, "shop.category.created", id, {
    name: body.name.trim()
  });

  return json({
    success: true,
    message: "Kategorie wurde erstellt.",
    id
  }, 201);
}

async function updateCategory(request, env, current, id) {
  if (!can(current, "shop.categories.manage")) {
    return json({ error: "Keine Berechtigung zum Verwalten von Kategorien." }, 403);
  }

  const body = await readBody(request);
  const error = validateCategory(body, true);

  if (error) return json({ error }, 400);

  const existing = await env.DB.prepare(`
    SELECT * FROM shop_categories WHERE id = ?
  `).bind(id).first();

  if (!existing) return json({ error: "Kategorie nicht gefunden." }, 404);

  const name = body.name !== undefined ? body.name.trim() : existing.name;
  const slug = body.slug !== undefined
    ? slugify(body.slug)
    : body.name !== undefined
      ? slugify(body.name)
      : existing.slug;

  const parentId = body.parent_id !== undefined
    ? body.parent_id
    : existing.parent_id;

  if (parentId === id) {
    return json({ error: "Eine Kategorie kann nicht ihr eigener Unterpunkt sein." }, 400);
  }

    if (parentId) {
    const parent = await env.DB.prepare(`
      SELECT id FROM shop_categories WHERE id = ?
    `).bind(parentId).first();

    if (!parent) {
      return json({
        error: "Übergeordnete Kategorie nicht gefunden."
      }, 404);
    }

    const descendants = await env.DB.prepare(`
      WITH RECURSIVE category_tree(id) AS (
        SELECT id
        FROM shop_categories
        WHERE parent_id = ?

        UNION ALL

        SELECT c.id
        FROM shop_categories c
        JOIN category_tree ct ON c.parent_id = ct.id
      )
      SELECT id FROM category_tree
    `).bind(id).all();

    if (descendants.results.some(row => row.id === parentId)) {
      return json({
        error: "Eine Kategorie kann nicht zu einem eigenen Unterpunkt werden."
      }, 400);
    }
  }

  try {
    await env.DB.prepare(`
      UPDATE shop_categories
      SET
        parent_id = ?,
        name = ?,
        slug = ?,
        description = ?,
        sort_order = ?,
        status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      parentId || null,
      name,
      slug,
      body.description !== undefined
        ? body.description?.trim() || null
        : existing.description,
      body.sort_order ?? existing.sort_order,
      body.status || existing.status,
      id
    ).run();
  } catch (error) {
    if (error.message?.includes("UNIQUE")) {
      return json({ error: "Dieser Kategorie-Slug ist bereits vergeben." }, 409);
    }
    throw error;
  }

  await audit(env, current.user.id, "shop.category.updated", id, { name });

  return json({ success: true, message: "Kategorie wurde aktualisiert." });
}

async function deleteCategory(env, current, id) {
  if (!can(current, "shop.categories.manage")) {
    return json({ error: "Keine Berechtigung zum Verwalten von Kategorien." }, 403);
  }

  const category = await env.DB.prepare(`
    SELECT id, name FROM shop_categories WHERE id = ?
  `).bind(id).first();

  if (!category) return json({ error: "Kategorie nicht gefunden." }, 404);

  const children = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM shop_categories
    WHERE parent_id = ?
  `).bind(id).first();

  if (children.count > 0) {
    return json({
      error: "Diese Kategorie enthält Unterkategorien und kann nicht gelöscht werden."
    }, 409);
  }

  await env.DB.prepare(`
    DELETE FROM shop_categories WHERE id = ?
  `).bind(id).run();

  await audit(env, current.user.id, "shop.category.deleted", id, {
    name: category.name
  });

  return json({ success: true, message: "Kategorie wurde gelöscht." });
}

// =========================================
// PRODUKTE
// =========================================

function validateProduct(body, partial = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Ungültige Anfrage.";
  }

  if (!partial || body.name !== undefined) {
    if (!validText(body.name, 180, true)) {
      return "Der Produktname muss zwischen 1 und 180 Zeichen lang sein.";
    }
  }

  if (body.short_description !== undefined &&
      !validText(body.short_description, 500)) {
    return "Die Kurzbeschreibung darf maximal 500 Zeichen enthalten.";
  }

  if (body.description !== undefined &&
      !validText(body.description, 10000)) {
    return "Die Beschreibung darf maximal 10.000 Zeichen enthalten.";
  }

  if (body.price_cents !== undefined && !validPrice(body.price_cents)) {
    return "Ungültiger Produktpreis.";
  }

  if (body.compare_at_price_cents !== undefined &&
      !validPrice(body.compare_at_price_cents)) {
    return "Ungültiger Vergleichspreis.";
  }

  if (body.sort_order !== undefined &&
      !Number.isInteger(body.sort_order)) {
    return "Ungültige Sortierung.";
  }

  if (body.is_featured !== undefined &&
      ![0, 1, true, false].includes(body.is_featured)) {
    return "Ungültiger Featured-Status.";
  }

  if (body.status !== undefined &&
      !["draft", "published", "archived"].includes(body.status)) {
    return "Ungültiger Produktstatus.";
  }

  return null;
}

async function createProduct(request, env, current) {
  if (!can(current, "shop.products.create")) {
    return json({ error: "Keine Berechtigung zum Erstellen von Produkten." }, 403);
  }

  const body = await readBody(request);
  const error = validateProduct(body);

  if (error) return json({ error }, 400);

  const id = crypto.randomUUID();
  const slug = slugify(body.slug || body.name);

  if (!slug) return json({ error: "Ungültiger Produkt-Slug." }, 400);

  try {
    await env.DB.prepare(`
      INSERT INTO shop_products (
        id, name, slug, short_description, description,
        price_cents, compare_at_price_cents, currency,
        status, is_featured, sort_order, created_by, updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)
    `).bind(
      id,
      body.name.trim(),
      slug,
      body.short_description?.trim() || null,
      body.description?.trim() || null,
      body.price_cents ?? null,
      body.compare_at_price_cents ?? null,
      body.currency || "EUR",
      body.is_featured ? 1 : 0,
      body.sort_order ?? 0,
      current.user.id,
      current.user.id
    ).run();
  } catch (error) {
    if (error.message?.includes("UNIQUE")) {
      return json({ error: "Dieser Produkt-Slug ist bereits vergeben." }, 409);
    }
    throw error;
  }

  await audit(env, current.user.id, "shop.product.created", id, {
    name: body.name.trim()
  });

  return json({
    success: true,
    message: "Produkt wurde als Entwurf erstellt.",
    id
  }, 201);
}

async function updateProduct(request, env, current, id) {
  if (!can(current, "shop.products.edit")) {
    return json({ error: "Keine Berechtigung zum Bearbeiten von Produkten." }, 403);
  }

  const body = await readBody(request);
  const error = validateProduct(body, true);

  if (error) return json({ error }, 400);

  const existing = await env.DB.prepare(`
    SELECT * FROM shop_products WHERE id = ?
  `).bind(id).first();

  if (!existing) return json({ error: "Produkt nicht gefunden." }, 404);

  const name = body.name !== undefined ? body.name.trim() : existing.name;
  const slug = body.slug !== undefined
    ? slugify(body.slug)
    : body.name !== undefined
      ? slugify(body.name)
      : existing.slug;

  try {
    await env.DB.prepare(`
      UPDATE shop_products
      SET
        name = ?,
        slug = ?,
        short_description = ?,
        description = ?,
        price_cents = ?,
        compare_at_price_cents = ?,
        currency = ?,
        is_featured = ?,
        sort_order = ?,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      name,
      slug,
      body.short_description !== undefined
        ? body.short_description?.trim() || null
        : existing.short_description,
      body.description !== undefined
        ? body.description?.trim() || null
        : existing.description,
      body.price_cents !== undefined ? body.price_cents : existing.price_cents,
      body.compare_at_price_cents !== undefined
        ? body.compare_at_price_cents
        : existing.compare_at_price_cents,
      body.currency || existing.currency,
      body.is_featured !== undefined
        ? (body.is_featured ? 1 : 0)
        : existing.is_featured,
      body.sort_order ?? existing.sort_order,
      current.user.id,
      id
    ).run();
  } catch (error) {
    if (error.message?.includes("UNIQUE")) {
      return json({ error: "Dieser Produkt-Slug ist bereits vergeben." }, 409);
    }
    throw error;
  }

  await audit(env, current.user.id, "shop.product.updated", id, { name });

  return json({ success: true, message: "Produkt wurde aktualisiert." });
}

async function deleteProduct(env, current, id) {
  if (!can(current, "shop.products.delete")) {
    return json({ error: "Keine Berechtigung zum Löschen von Produkten." }, 403);
  }

  const product = await env.DB.prepare(`
    SELECT id, name FROM shop_products WHERE id = ?
  `).bind(id).first();

  if (!product) return json({ error: "Produkt nicht gefunden." }, 404);

  await env.DB.prepare(`
    DELETE FROM shop_products WHERE id = ?
  `).bind(id).run();

  await audit(env, current.user.id, "shop.product.deleted", id, {
    name: product.name
  });

  return json({ success: true, message: "Produkt wurde gelöscht." });
}

async function changeProductStatus(env, current, id, action) {
  if (!can(current, "shop.products.publish")) {
    return json({ error: "Keine Berechtigung zum Veröffentlichen von Produkten." }, 403);
  }

  const product = await env.DB.prepare(`
    SELECT id, name, status FROM shop_products WHERE id = ?
  `).bind(id).first();

  if (!product) return json({ error: "Produkt nicht gefunden." }, 404);

  const status = action === "publish" ? "published" : "draft";

  await env.DB.prepare(`
    UPDATE shop_products
    SET
      status = ?,
      published_at = ?,
      updated_by = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    status,
    status === "published" ? new Date().toISOString() : null,
    current.user.id,
    id
  ).run();

  await audit(env, current.user.id, `shop.product.${action}`, id, {
    name: product.name,
    status
  });

  return json({
    success: true,
    message: status === "published"
      ? "Produkt wurde veröffentlicht."
      : "Produkt wurde zurückgezogen."
  });
}

// =========================================
// PRODUKTKATEGORIEN
// =========================================

async function setProductCategories(request, env, current, productId) {
  if (!can(current, "shop.products.edit")) {
    return json({ error: "Keine Berechtigung zum Bearbeiten von Produkten." }, 403);
  }

  const body = await readBody(request);

  if (!Array.isArray(body?.category_ids) ||
      body.category_ids.some(id => !validId(id))) {
    return json({ error: "Bitte gültige category_ids übermitteln." }, 400);
  }

  const product = await env.DB.prepare(`
    SELECT id FROM shop_products WHERE id = ?
  `).bind(productId).first();

  if (!product) return json({ error: "Produkt nicht gefunden." }, 404);

  const statements = [
    env.DB.prepare(`
      DELETE FROM shop_product_categories WHERE product_id = ?
    `).bind(productId)
  ];

  for (const categoryId of [...new Set(body.category_ids)]) {
    statements.push(
      env.DB.prepare(`
        INSERT INTO shop_product_categories (product_id, category_id)
        VALUES (?, ?)
      `).bind(productId, categoryId)
    );
  }

  try {
    await env.DB.batch(statements);
  } catch {
    return json({ error: "Mindestens eine Kategorie wurde nicht gefunden." }, 400);
  }

  await audit(env, current.user.id, "shop.product.categories.updated", productId, {
    category_ids: [...new Set(body.category_ids)]
  });

  return json({ success: true, message: "Produktkategorien wurden aktualisiert." });
}

// =========================================
// PRODUKTBILDER
// =========================================

async function addProductImage(request, env, current, productId) {
  if (!can(current, "shop.products.edit")) {
    return json({ error: "Keine Berechtigung zum Bearbeiten von Produkten." }, 403);
  }

  const body = await readBody(request);

  if (!validText(body?.image_key, 500, true) ||
      !/^shop\/[0-9a-f-]+\.(jpg|png|webp|gif)$/i.test(body.image_key)) {
    return json({ error: "Ungültiger Produktbild-Verweis." }, 400);
  }

  if (body.alt_text !== undefined && !validText(body.alt_text, 300)) {
    return json({ error: "Der Alt-Text darf maximal 300 Zeichen enthalten." }, 400);
  }

  const product = await env.DB.prepare(`
    SELECT id FROM shop_products WHERE id = ?
  `).bind(productId).first();

  if (!product) return json({ error: "Produkt nicht gefunden." }, 404);

  const id = crypto.randomUUID();
  const isPrimary = body.is_primary ? 1 : 0;

  if (isPrimary) {
    await env.DB.prepare(`
      UPDATE shop_product_images
      SET is_primary = 0
      WHERE product_id = ?
    `).bind(productId).run();
  }

  await env.DB.prepare(`
    INSERT INTO shop_product_images (
      id, product_id, image_key, alt_text, sort_order, is_primary
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    productId,
    body.image_key,
    body.alt_text?.trim() || null,
    Number.isInteger(body.sort_order) ? body.sort_order : 0,
    isPrimary
  ).run();

  await audit(env, current.user.id, "shop.product.image.added", productId, {
    image_id: id
  });

  return json({ success: true, id }, 201);
}

async function deleteProductImage(env, current, imageId) {
  if (!can(current, "shop.products.edit")) {
    return json({ error: "Keine Berechtigung zum Bearbeiten von Produkten." }, 403);
  }

  const image = await env.DB.prepare(`
    SELECT id, product_id, image_key
    FROM shop_product_images
    WHERE id = ?
  `).bind(imageId).first();

  if (!image) return json({ error: "Produktbild nicht gefunden." }, 404);

  await env.DB.prepare(`
    DELETE FROM shop_product_images WHERE id = ?
  `).bind(imageId).run();

  await audit(env, current.user.id, "shop.product.image.deleted", image.product_id, {
    image_id: imageId
  });

  return json({ success: true, message: "Produktbild wurde entfernt." });
}

// =========================================
// PRODUKTVARIANTEN
// =========================================

function validateVariant(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Ungültige Anfrage.";
  }

  if (!validText(body.variant_name, 120, true)) {
    return "Der Variantenname ist erforderlich.";
  }

  for (const field of [
    "option1_name", "option1_value",
    "option2_name", "option2_value",
    "option3_name", "option3_value"
  ]) {
    if (body[field] !== undefined && !validText(body[field], 100)) {
      return `Ungültiger Wert für ${field}.`;
    }
  }

  if (body.sku !== undefined && !validText(body.sku, 100)) {
    return "Ungültige SKU.";
  }

  if (body.price_cents !== undefined && !validPrice(body.price_cents)) {
    return "Ungültiger Variantenpreis.";
  }

  if (body.compare_at_price_cents !== undefined &&
      !validPrice(body.compare_at_price_cents)) {
    return "Ungültiger Vergleichspreis.";
  }

  if (body.stock_quantity !== undefined &&
      (!Number.isInteger(body.stock_quantity) || body.stock_quantity < 0)) {
    return "Der Lagerbestand muss eine positive ganze Zahl sein.";
  }

  if (body.track_inventory !== undefined &&
      ![0, 1, true, false].includes(body.track_inventory)) {
    return "Ungültige Lagerbestandseinstellung.";
  }

  if (body.status !== undefined &&
      !["active", "inactive"].includes(body.status)) {
    return "Ungültiger Variantenstatus.";
  }

  return null;
}

async function createVariant(request, env, current, productId) {
  if (!can(current, "shop.products.edit")) {
    return json({ error: "Keine Berechtigung zum Bearbeiten von Produkten." }, 403);
  }

  const body = await readBody(request);
  const error = validateVariant(body);

  if (error) return json({ error }, 400);

  const product = await env.DB.prepare(`
    SELECT id FROM shop_products WHERE id = ?
  `).bind(productId).first();

  if (!product) return json({ error: "Produkt nicht gefunden." }, 404);

  const id = crypto.randomUUID();

  try {
    await env.DB.prepare(`
      INSERT INTO shop_product_variants (
        id, product_id, variant_name, sku,
        option1_name, option1_value,
        option2_name, option2_value,
        option3_name, option3_value,
        price_cents, compare_at_price_cents,
        stock_quantity, track_inventory, status, sort_order
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      productId,
      body.variant_name.trim(),
      body.sku?.trim() || null,
      body.option1_name?.trim() || null,
      body.option1_value?.trim() || null,
      body.option2_name?.trim() || null,
      body.option2_value?.trim() || null,
      body.option3_name?.trim() || null,
      body.option3_value?.trim() || null,
      body.price_cents ?? null,
      body.compare_at_price_cents ?? null,
      body.stock_quantity ?? 0,
      body.track_inventory ? 1 : 0,
      body.status || "active",
      body.sort_order ?? 0
    ).run();
  } catch (error) {
    if (error.message?.includes("UNIQUE")) {
      return json({ error: "Diese SKU ist bereits vergeben." }, 409);
    }
    throw error;
  }

  await audit(env, current.user.id, "shop.product.variant.created", productId, {
    variant_id: id,
    variant_name: body.variant_name
  });

  return json({ success: true, id }, 201);
}

async function deleteVariant(env, current, variantId) {
  if (!can(current, "shop.products.edit")) {
    return json({ error: "Keine Berechtigung zum Bearbeiten von Produkten." }, 403);
  }

  const variant = await env.DB.prepare(`
    SELECT id, product_id, variant_name
    FROM shop_product_variants
    WHERE id = ?
  `).bind(variantId).first();

  if (!variant) return json({ error: "Variante nicht gefunden." }, 404);

  await env.DB.prepare(`
    DELETE FROM shop_product_variants WHERE id = ?
  `).bind(variantId).run();

  await audit(env, current.user.id, "shop.product.variant.deleted", variant.product_id, {
    variant_id: variantId,
    variant_name: variant.variant_name
  });

  return json({ success: true, message: "Variante wurde gelöscht." });
}

// =========================================
// GESCHÜTZTE SHOP-API
// =========================================

export async function handleShopApi(request, env, auth) {
  const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();

  const current = await getUser(request, env, auth);
  if (current.error) return current.error;

  if (path === "/api/admin/shop/categories" && method === "GET") {
    if (!can(current, "shop.view")) {
      return json({ error: "Keine Berechtigung zum Anzeigen des Shops." }, 403);
    }

    const result = await env.DB.prepare(`
      SELECT * FROM shop_categories
      ORDER BY sort_order ASC, name ASC
    `).all();

    return json({ success: true, categories: result.results });
  }

  if (path === "/api/admin/shop/categories" && method === "POST") {
    return createCategory(request, env, current);
  }

  const categoryMatch = path.match(/^\/api\/admin\/shop\/categories\/([^/]+)$/);

  if (categoryMatch && method === "PATCH") {
    return updateCategory(request, env, current, categoryMatch[1]);
  }

  if (categoryMatch && method === "DELETE") {
    return deleteCategory(env, current, categoryMatch[1]);
  }

  if (path === "/api/admin/shop/products" && method === "GET") {
    if (!can(current, "shop.view")) {
      return json({ error: "Keine Berechtigung zum Anzeigen des Shops." }, 403);
    }

    const result = await env.DB.prepare(`
      SELECT *
      FROM shop_products
      ORDER BY sort_order ASC, updated_at DESC
    `).all();

    return json({ success: true, products: result.results });
  }

  if (path === "/api/admin/shop/products" && method === "POST") {
    return createProduct(request, env, current);
  }

  const productActionMatch = path.match(
    /^\/api\/admin\/shop\/products\/([^/]+)\/(publish|unpublish)$/
  );

  if (productActionMatch && method === "POST") {
    return changeProductStatus(
      env,
      current,
      productActionMatch[1],
      productActionMatch[2]
    );
  }

  const productCategoriesMatch = path.match(
    /^\/api\/admin\/shop\/products\/([^/]+)\/categories$/
  );

  if (productCategoriesMatch && method === "PUT") {
    return setProductCategories(
      request,
      env,
      current,
      productCategoriesMatch[1]
    );
  }

  const productImagesMatch = path.match(
    /^\/api\/admin\/shop\/products\/([^/]+)\/images$/
  );

  if (productImagesMatch && method === "POST") {
    return addProductImage(
      request,
      env,
      current,
      productImagesMatch[1]
    );
  }

  const productVariantsMatch = path.match(
    /^\/api\/admin\/shop\/products\/([^/]+)\/variants$/
  );

  if (productVariantsMatch && method === "POST") {
    return createVariant(
      request,
      env,
      current,
      productVariantsMatch[1]
    );
  }

  const productMatch = path.match(/^\/api\/admin\/shop\/products\/([^/]+)$/);

  if (productMatch && method === "PATCH") {
    return updateProduct(request, env, current, productMatch[1]);
  }

  if (productMatch && method === "DELETE") {
    return deleteProduct(env, current, productMatch[1]);
  }

  const imageMatch = path.match(
    /^\/api\/admin\/shop\/images\/([^/]+)$/
  );

  if (imageMatch && method === "DELETE") {
    return deleteProductImage(env, current, imageMatch[1]);
  }

  const variantMatch = path.match(
    /^\/api\/admin\/shop\/variants\/([^/]+)$/
  );

  if (variantMatch && method === "DELETE") {
    return deleteVariant(env, current, variantMatch[1]);
  }

  return json({ error: "Shop-Endpunkt nicht gefunden." }, 404);
}

// =========================================
// ÖFFENTLICHE SHOP-API
// =========================================

export async function handlePublicShopApi(request, env) {
  if (request.method.toUpperCase() !== "GET") {
    return json({ error: "Methode nicht erlaubt." }, 405);
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");

  if (path === "/api/shop/categories") {
    const result = await env.DB.prepare(`
      SELECT id, parent_id, name, slug, description, image_key, sort_order
      FROM shop_categories
      WHERE status = 'active'
      ORDER BY sort_order ASC, name ASC
    `).all();

    return json({ success: true, categories: result.results });
  }

  const slugMatch = path.match(/^\/api\/shop\/([^/]+)$/);

  if (slugMatch && slugMatch[1] !== "categories") {
    const product = await env.DB.prepare(`
      SELECT
        id, name, slug, short_description, description,
        price_cents, compare_at_price_cents, currency,
        is_featured
      FROM shop_products
      WHERE slug = ? AND status = 'published'
    `).bind(slugMatch[1]).first();

    if (!product) return json({ error: "Produkt nicht gefunden." }, 404);

    const [images, variants, categories] = await Promise.all([
      env.DB.prepare(`
        SELECT id, image_key, alt_text, sort_order, is_primary
        FROM shop_product_images
        WHERE product_id = ?
        ORDER BY is_primary DESC, sort_order ASC
      `).bind(product.id).all(),

      env.DB.prepare(`
        SELECT
          id, variant_name, sku,
          option1_name, option1_value,
          option2_name, option2_value,
          option3_name, option3_value,
          price_cents, compare_at_price_cents
        FROM shop_product_variants
        WHERE product_id = ? AND status = 'active'
        ORDER BY sort_order ASC, variant_name ASC
      `).bind(product.id).all(),

      env.DB.prepare(`
        SELECT c.id, c.name, c.slug
        FROM shop_product_categories pc
        JOIN shop_categories c ON c.id = pc.category_id
        WHERE pc.product_id = ? AND c.status = 'active'
        ORDER BY c.sort_order ASC, c.name ASC
      `).bind(product.id).all()
    ]);

    return json({
      success: true,
      product: {
        ...product,
        images: images.results,
        variants: variants.results,
        categories: categories.results
      }
    });
  }

  if (path === "/api/shop" || path === "/api/shop/") {
    const result = await env.DB.prepare(`
      SELECT
        p.id, p.name, p.slug, p.short_description,
        p.price_cents, p.compare_at_price_cents,
        p.currency, p.is_featured,
        (
          SELECT image_key
          FROM shop_product_images i
          WHERE i.product_id = p.id
          ORDER BY i.is_primary DESC, i.sort_order ASC
          LIMIT 1
        ) AS primary_image
      FROM shop_products p
      WHERE p.status = 'published'
      ORDER BY p.sort_order ASC, p.published_at DESC
    `).all();

    return json({ success: true, products: result.results });
  }

  return json({ error: "Shop-Endpunkt nicht gefunden." }, 404);
}


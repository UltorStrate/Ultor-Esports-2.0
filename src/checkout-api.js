function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

function clean(value, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validEmail(value) {
  return typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validCountry(value) {
  return typeof value === "string" && /^[A-Z]{2}$/.test(value);
}

function orderNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `ULT-${date}-${suffix}`;
}

function testAccessConfigured(env) {
  return typeof env.SHOP_TEST_ACCESS_CODE === "string" &&
    env.SHOP_TEST_ACCESS_CODE.length >= 32 &&
    env.SHOP_TEST_ACCESS_CODE.length <= 256;
}

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  let difference = 0;
  for (let i = 0; i < a.length; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

function checkoutMode(env) {
  return env.SHOP_CHECKOUT_MODE === "test" && testAccessConfigured(env)
    ? "test"
    : "disabled";
}

export async function handleCheckoutApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (path === "/api/checkout/config" && request.method === "GET") {
    const testModeRequested = env.SHOP_CHECKOUT_MODE === "test";
    const testAccessReady = testAccessConfigured(env);
    const shippingCents = Number(env.SHOP_TEST_SHIPPING_CENTS);
    const shippingConfigured = Number.isInteger(shippingCents) &&
      shippingCents >= 0 && shippingCents <= 50000;
    let databaseReady = false;
    try {
      const requiredTables = [
        "shop_orders",
        "shop_order_items",
        "shop_order_events",
        "shop_printful_fulfillments",
        "shop_printful_variant_map"
      ];
      const placeholders = requiredTables.map(() => "?").join(", ");
      const tables = await env.DB.prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`
      ).bind(...requiredTables).all();
      const found = new Set((tables.results || []).map(row => row.name));
      databaseReady = requiredTables.every(name => found.has(name));
    } catch (error) {
      console.error("Checkout database readiness check failed:", error);
    }

    const available = testModeRequested && testAccessReady && shippingConfigured && databaseReady;

    return json({
      success: true,
      mode: testModeRequested ? "test" : "disabled",
      checkout_available: available,
      shipping_cents: shippingConfigured ? shippingCents : null,
      test_access_configured: testAccessReady,
      shipping_configured: shippingConfigured,
      database_ready: databaseReady,
      payments_enabled: false,
      printful_submission_enabled: false,
      message: available
        ? "Der technische Test-Checkout ist aktiv. Es werden weder Zahlungen ausgelöst noch Aufträge an Printful übermittelt."
        : "Der Test-Checkout ist noch nicht vollständig konfiguriert. Prüfe Testmodus, SHOP_TEST_ACCESS_CODE, Versandkosten und die D1-Shopmigrationen."
    });
  }

  if (path !== "/api/checkout/orders" || request.method !== "POST") {
    return json({ error: "Checkout-Endpunkt nicht gefunden." }, 404);
  }

  if (checkoutMode(env) !== "test") {
    return json({
      error: "Der Checkout ist aktuell noch nicht freigeschaltet.",
      code: "CHECKOUT_DISABLED"
    }, 503);
  }

  const suppliedTestCode = request.headers.get("X-Shop-Test-Code") || "";
  if (!constantTimeEqual(suppliedTestCode, env.SHOP_TEST_ACCESS_CODE)) {
    return json({
      error: "Der Testzugang ist ungültig oder fehlt.",
      code: "TEST_ACCESS_DENIED"
    }, 403);
  }

  const shippingCents = Number(env.SHOP_TEST_SHIPPING_CENTS);
  if (!Number.isInteger(shippingCents) || shippingCents < 0 || shippingCents > 50000) {
    return json({
      error: "Die Test-Versandkosten sind noch nicht korrekt konfiguriert.",
      code: "SHIPPING_NOT_CONFIGURED"
    }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Ungültige Anfrage." }, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Ungültige Bestelldaten." }, 400);
  }

  const customerName = clean(body.customer?.name, 160);
  const customerEmail = clean(body.customer?.email, 254).toLowerCase();
  const customerPhone = clean(body.customer?.phone, 40) || null;
  const shipping = body.shipping || {};
  const shippingName = clean(shipping.name, 160) || customerName;
  const shippingCompany = clean(shipping.company, 160) || null;
  const address1 = clean(shipping.address1, 180);
  const address2 = clean(shipping.address2, 180) || null;
  const city = clean(shipping.city, 120);
  const state = clean(shipping.state, 120) || null;
  const postalCode = clean(shipping.postal_code, 24);
  const countryCode = clean(shipping.country_code, 2).toUpperCase();
  const shippingPhone = clean(shipping.phone, 40) || customerPhone;
  const customerNote = clean(body.customer_note, 1000) || null;
  const idempotencyKey = clean(body.idempotency_key, 100);

  if (!customerName || !validEmail(customerEmail)) {
    return json({ error: "Bitte gib einen gültigen Namen und eine gültige E-Mail-Adresse an." }, 400);
  }

  if (!shippingName || !address1 || !city || !postalCode || !validCountry(countryCode)) {
    return json({ error: "Bitte vervollständige die Lieferadresse. Das Land muss als ISO-2-Code angegeben werden." }, 400);
  }

  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) {
    return json({ error: "Der Warenkorb muss zwischen 1 und 20 Positionen enthalten." }, 400);
  }

  if (idempotencyKey && idempotencyKey.length < 8) {
    return json({ error: "Ungültiger Bestellschlüssel." }, 400);
  }

  if (idempotencyKey) {
    const previous = await env.DB.prepare(`
      SELECT id, order_number, customer_email, total_cents, currency, order_status
      FROM shop_orders WHERE idempotency_key = ?
    `).bind(idempotencyKey).first();
    if (previous) {
      if (previous.customer_email !== customerEmail) {
        return json({ error: "Dieser Bestellschlüssel wurde bereits verwendet." }, 409);
      }
      return json({
        success: true,
        mode: "test",
        payments_enabled: false,
        printful_submission_enabled: false,
        order: previous,
        idempotent_replay: true,
        message: "Diese Testbestellung wurde bereits gespeichert."
      });
    }
  }

  // Client prices, names and totals are deliberately ignored. All commercial
  // values are loaded again from D1 to prevent price manipulation.
  const normalizedItems = [];
  const seen = new Set();
  let subtotalCents = 0;

  for (const raw of body.items) {
    const productId = clean(raw?.product_id, 100);
    const variantId = clean(raw?.variant_id, 100) || null;
    const quantity = Number(raw?.quantity);

    if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      return json({ error: "Eine Warenkorbposition enthält ungültige Produkt- oder Mengenangaben." }, 400);
    }

    const key = `${productId}::${variantId || "default"}`;
    if (seen.has(key)) {
      return json({ error: "Doppelte Warenkorbpositionen sind nicht zulässig." }, 400);
    }
    seen.add(key);

    const product = await env.DB.prepare(`
      SELECT id, name, slug, price_cents, currency, status
      FROM shop_products
      WHERE id = ? AND status = 'published'
    `).bind(productId).first();

    if (!product) {
      return json({ error: "Ein Produkt ist nicht mehr verfügbar. Bitte aktualisiere deinen Warenkorb." }, 409);
    }

    let variant = null;
    if (variantId) {
      variant = await env.DB.prepare(`
        SELECT id, product_id, variant_name, sku, price_cents,
               stock_quantity, track_inventory, status
        FROM shop_product_variants
        WHERE id = ? AND product_id = ? AND status = 'active'
      `).bind(variantId, productId).first();

      if (!variant) {
        return json({ error: "Eine Produktvariante ist nicht mehr verfügbar. Bitte aktualisiere deinen Warenkorb." }, 409);
      }
    } else {
      const hasVariants = await env.DB.prepare(`
        SELECT id FROM shop_product_variants
        WHERE product_id = ? AND status = 'active' LIMIT 1
      `).bind(productId).first();
      if (hasVariants) {
        return json({ error: "Bitte wähle für jedes Produkt eine Variante aus." }, 400);
      }
    }

    if (variant && Number(variant.track_inventory) === 1 &&
        Number(variant.stock_quantity) < quantity) {
      return json({ error: `Für ${product.name} ist die gewünschte Menge nicht verfügbar.` }, 409);
    }

    const basePriceCents = variant?.price_cents ?? product.price_cents;
    if (!Number.isInteger(basePriceCents) || basePriceCents < 0) {
      return json({ error: `Für ${product.name} ist kein gültiger Verkaufspreis hinterlegt.` }, 409);
    }

    const rawPersonalization = raw?.personalization;
    let personalization = null;
    if (rawPersonalization && rawPersonalization.enabled === true) {
      const isJersey = /jersey|trikot/i.test(String(product.slug || "") + " " + String(product.name || ""));
      const rawName = typeof rawPersonalization.name === "string" ? rawPersonalization.name.trim() : "";
      const rawNumber = typeof rawPersonalization.number === "string" ? rawPersonalization.number.trim() : "";
      const customName = rawName.toUpperCase();
      const customNumber = rawNumber;
      if (!isJersey || rawName.length > 14 || rawNumber.length > 2 ||
          (!customName && !customNumber) ||
          !/^[\p{L}0-9 .'-]*$/u.test(customName) ||
          !/^\d{0,2}$/.test(customNumber)) {
        return json({ error: "Die Trikot-Personalisierung ist ungültig." }, 400);
      }
      personalization = {
        enabled: true,
        name: customName,
        number: customNumber,
        font: "ultor",
        color: "white",
        surcharge_cents: 500
      };
    }

    const priceCents = basePriceCents + (personalization ? 500 : 0);
    const lineTotal = priceCents * quantity;
    subtotalCents += lineTotal;
    if (!Number.isSafeInteger(subtotalCents) || subtotalCents > 100000000) {
      return json({ error: "Der Warenkorbwert ist ungültig." }, 400);
    }

    const mapping = variantId
      ? await env.DB.prepare(`
          SELECT printful_sync_variant_id
          FROM shop_printful_variant_map
          WHERE shop_variant_id = ?
        `).bind(variantId).first()
      : null;

    normalizedItems.push({
      id: crypto.randomUUID(),
      shop_product_id: product.id,
      shop_variant_id: variant?.id || null,
      printful_sync_variant_id: mapping?.printful_sync_variant_id || null,
      product_name: product.name,
      variant_name: variant?.variant_name || null,
      sku: variant?.sku || null,
      quantity,
      unit_price_cents: priceCents,
      line_total_cents: lineTotal,
      product_snapshot_json: JSON.stringify({ id: product.id, name: product.name, slug: product.slug }),
      variant_snapshot_json: JSON.stringify({
        ...(variant || {}),
        ...(personalization ? { personalization } : {})
      })
    });
  }

  const totalCents = subtotalCents + shippingCents;
  const orderId = crypto.randomUUID();
  const number = orderNumber();

  const statements = [
    env.DB.prepare(`
      INSERT INTO shop_orders (
        id, order_number, customer_email, customer_name, customer_phone,
        currency, subtotal_cents, shipping_cents, discount_cents, total_cents,
        payment_status, fulfillment_status, order_status, idempotency_key,
        customer_note, shipping_name, shipping_company, shipping_address1,
        shipping_address2, shipping_city, shipping_state, shipping_postal_code,
        shipping_country_code, shipping_phone
      ) VALUES (?, ?, ?, ?, ?, 'EUR', ?, ?, 0, ?, 'unpaid',
        'unfulfilled', 'on_hold', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(idempotency_key) DO NOTHING
    `).bind(
      orderId, number, customerEmail, customerName, customerPhone,
      subtotalCents, shippingCents, totalCents, idempotencyKey || null,
      customerNote, shippingName, shippingCompany, address1, address2,
      city, state, postalCode, countryCode, shippingPhone
    )
  ];

  for (const item of normalizedItems) {
    statements.push(env.DB.prepare(`
      INSERT INTO shop_order_items (
        id, order_id, shop_product_id, shop_variant_id,
        printful_sync_variant_id, product_name, variant_name, sku,
        quantity, unit_price_cents, line_total_cents,
        product_snapshot_json, variant_snapshot_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      item.id, orderId, item.shop_product_id, item.shop_variant_id,
      item.printful_sync_variant_id, item.product_name, item.variant_name,
      item.sku, item.quantity, item.unit_price_cents, item.line_total_cents,
      item.product_snapshot_json, item.variant_snapshot_json
    ));
  }

  statements.push(env.DB.prepare(`
    INSERT INTO shop_order_events (id, order_id, event_type, message, details_json)
    VALUES (?, ?, 'test_order_created', 'Testbestellung im Vorbereitungsmodus angelegt.', ?)
  `).bind(
    crypto.randomUUID(), orderId,
    JSON.stringify({ mode: "test", payment: "disabled", fulfillment: "disabled" })
  ));

  try {
    await env.DB.batch(statements);
  } catch (error) {
    console.error("Checkout order creation failed:", error);
    return json({ error: "Die Bestellung konnte nicht gespeichert werden." }, 500);
  }

  const savedOrder = idempotencyKey
    ? await env.DB.prepare("SELECT id, order_number, total_cents, currency, order_status FROM shop_orders WHERE idempotency_key = ?")
        .bind(idempotencyKey).first()
    : await env.DB.prepare("SELECT id, order_number, total_cents, currency, order_status FROM shop_orders WHERE id = ?")
        .bind(orderId).first();

  if (!savedOrder) {
    return json({ error: "Die Bestellung konnte nicht bestätigt werden." }, 500);
  }

  return json({
    success: true,
    mode: "test",
    payments_enabled: false,
    printful_submission_enabled: false,
    order: savedOrder,
    message: "Testbestellung gespeichert. Es wurde keine Zahlung ausgelöst und kein Printful-Auftrag übermittelt."
  }, 201);
}

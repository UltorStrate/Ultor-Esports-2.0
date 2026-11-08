function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

async function getCurrentUser(request, env, auth) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return { error: json({ error: "Nicht angemeldet." }, 401) };

  const user = await env.DB.prepare(
    "SELECT id, name, email, status, is_owner FROM users WHERE id = ?"
  ).bind(session.user.id).first();

  if (!user || user.status !== "approved") {
    return { error: json({ error: "Zugriff nicht freigegeben." }, 403) };
  }

  const rows = await env.DB.prepare(`
    SELECT p.name
    FROM user_permissions up
    JOIN permissions p ON p.id = up.permission_id
    WHERE up.user_id = ?
  `).bind(user.id).all();

  return {
    user,
    permissions: user.is_owner === 1 ? ["*"] : (rows.results || []).map(row => row.name)
  };
}

function can(current, permission) {
  return current.user.is_owner === 1 ||
    current.permissions.includes("*") ||
    current.permissions.includes(permission);
}

async function audit(env, userId, action, orderId, details = null) {
  await env.DB.prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, 'shop_order', ?, ?)
  `).bind(
    crypto.randomUUID(),
    userId,
    action,
    orderId,
    details ? JSON.stringify(details) : null
  ).run();
}

export async function handleAdminOrdersApi(request, env, auth) {
  const current = await getCurrentUser(request, env, auth);
  if (current.error) return current.error;

  if (!can(current, "shop.orders.view")) {
    return json({ error: "Keine Berechtigung zum Anzeigen von Bestellungen." }, 403);
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();

  if (path === "/api/admin/shop/orders" && method === "GET") {
    const status = url.searchParams.get("status");
    const query = (url.searchParams.get("q") || "").trim().slice(0, 120);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 100);
    const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

    const rows = await env.DB.prepare(`
      SELECT
        o.id, o.order_number, o.customer_email, o.customer_name,
        o.currency, o.total_cents, o.payment_status,
        o.fulfillment_status, o.order_status, o.tracking_number,
        o.created_at, o.updated_at,
        (SELECT COUNT(*) FROM shop_order_items i WHERE i.order_id = o.id) AS item_count
      FROM shop_orders o
      WHERE (? IS NULL OR o.order_status = ?)
        AND (? = '' OR o.order_number LIKE ? OR o.customer_email LIKE ? OR o.customer_name LIKE ?)
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(
      status || null, status || null,
      query, `%${query}%`, `%${query}%`, `%${query}%`,
      limit, offset
    ).all();

    return json({ success: true, orders: rows.results || [], limit, offset });
  }

  const detailMatch = path.match(/^\/api\/admin\/shop\/orders\/([0-9a-f-]+)$/i);
  if (detailMatch && method === "GET") {
    const orderId = detailMatch[1];
    const order = await env.DB.prepare(
      "SELECT * FROM shop_orders WHERE id = ?"
    ).bind(orderId).first();
    if (!order) return json({ error: "Bestellung nicht gefunden." }, 404);

    const [items, events, fulfillment] = await Promise.all([
      env.DB.prepare(
        "SELECT * FROM shop_order_items WHERE order_id = ? ORDER BY created_at ASC"
      ).bind(orderId).all(),
      env.DB.prepare(
        "SELECT id, event_type, message, details_json, actor_user_id, created_at FROM shop_order_events WHERE order_id = ? ORDER BY created_at DESC"
      ).bind(orderId).all(),
      env.DB.prepare(
        "SELECT status, printful_order_id, last_error, attempt_count, next_retry_at, submitted_at, updated_at FROM shop_printful_fulfillments WHERE order_id = ?"
      ).bind(orderId).first()
    ]);

    return json({
      success: true,
      order,
      items: items.results || [],
      events: events.results || [],
      fulfillment: fulfillment || null
    });
  }

  const noteMatch = path.match(/^\/api\/admin\/shop\/orders\/([0-9a-f-]+)\/note$/i);
  if (noteMatch && method === "POST") {
    if (!can(current, "shop.orders.manage")) {
      return json({ error: "Keine Berechtigung zum Bearbeiten von Bestellungen." }, 403);
    }
    let body;
    try { body = await request.json(); } catch { body = null; }
    const note = typeof body?.note === "string" ? body.note.trim() : "";
    if (!note || note.length > 4000) {
      return json({ error: "Die interne Notiz muss zwischen 1 und 4.000 Zeichen lang sein." }, 400);
    }

    const orderId = noteMatch[1];
    const order = await env.DB.prepare(
      "SELECT id FROM shop_orders WHERE id = ?"
    ).bind(orderId).first();
    if (!order) return json({ error: "Bestellung nicht gefunden." }, 404);

    await env.DB.batch([
      env.DB.prepare(
        "UPDATE shop_orders SET internal_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(note, orderId),
      env.DB.prepare(`
        INSERT INTO shop_order_events (id, order_id, event_type, message, actor_user_id)
        VALUES (?, ?, 'admin_note', ?, ?)
      `).bind(crypto.randomUUID(), orderId, "Interne Notiz aktualisiert.", current.user.id)
    ]);
    await audit(env, current.user.id, "shop.order.note_updated", orderId);
    return json({ success: true, message: "Interne Notiz gespeichert." });
  }


  const orderActionMatch = path.match(/^\/api\/admin\/shop\/orders\/([0-9a-f-]+)\/(cancel|delete)$/i);
  if (orderActionMatch && method === "POST") {
    if (!can(current, "shop.orders.manage")) {
      return json({ error: "Keine Berechtigung zum Verwalten von Bestellungen." }, 403);
    }

    const orderId = orderActionMatch[1];
    const action = orderActionMatch[2].toLowerCase();
    const order = await env.DB.prepare(`
      SELECT id, order_number, payment_status, fulfillment_status,
             order_status, printful_order_id
      FROM shop_orders WHERE id = ?
    `).bind(orderId).first();
    if (!order) return json({ error: "Bestellung nicht gefunden." }, 404);

    const fulfillment = await env.DB.prepare(`
      SELECT status, printful_order_id, submitted_at
      FROM shop_printful_fulfillments WHERE order_id = ?
    `).bind(orderId).first();

    const alreadySentToPrintful =
      order.printful_order_id !== null ||
      (fulfillment && (
        fulfillment.printful_order_id !== null ||
        fulfillment.submitted_at !== null ||
        !["not_submitted", "failed", "cancelled"].includes(fulfillment.status)
      ));

    if (order.payment_status === "paid" ||
        order.payment_status === "refunded" ||
        order.payment_status === "partially_refunded") {
      return json({ error: "Diese Bestellung hat einen Zahlungsvorgang. Bitte nicht löschen oder hier stornieren; eine ordnungsgemäße Rückabwicklung ist erforderlich." }, 409);
    }

    if (alreadySentToPrintful) {
      return json({ error: "Diese Bestellung wurde bereits an Printful übermittelt oder dort verarbeitet und kann hier nicht gelöscht bzw. storniert werden." }, 409);
    }

    if (action === "cancel") {
      if (order.order_status === "cancelled") {
        return json({ success: true, message: "Die Bestellung ist bereits storniert." });
      }
      await env.DB.batch([
        env.DB.prepare(`
          UPDATE shop_orders
          SET order_status = 'cancelled',
              payment_status = CASE WHEN payment_status IN ('unpaid','pending','failed') THEN 'cancelled' ELSE payment_status END,
              fulfillment_status = 'cancelled',
              cancelled_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(orderId),
        env.DB.prepare(`
          INSERT INTO shop_order_events (id, order_id, event_type, message, actor_user_id)
          VALUES (?, ?, 'admin_cancelled', 'Bestellung wurde im CMS storniert.', ?)
        `).bind(crypto.randomUUID(), orderId, current.user.id)
      ]);
      await audit(env, current.user.id, "shop.order.cancelled", orderId, { order_number: order.order_number });
      return json({ success: true, message: "Bestellung wurde storniert." });
    }

    if (action === "delete") {
      if (!["unpaid", "pending", "failed", "cancelled"].includes(order.payment_status) ||
          !["unfulfilled", "cancelled"].includes(order.fulfillment_status)) {
        return json({ error: "Nur unbezahlte und nicht erfüllte Bestellungen können endgültig gelöscht werden." }, 409);
      }
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
          VALUES (?, ?, 'shop.order.deleted', 'shop_order', ?, ?)
        `).bind(
          crypto.randomUUID(), current.user.id, orderId,
          JSON.stringify({ order_number: order.order_number, reason: "admin_delete" })
        ),
        env.DB.prepare("DELETE FROM shop_orders WHERE id = ?").bind(orderId)
      ]);
      return json({ success: true, message: "Unbezahlte Testbestellung wurde endgültig gelöscht." });
    }
  }

  // Payment and fulfillment states are deliberately not editable via the CMS.
  // They must be changed only by verified payment-provider webhooks and the
  // idempotent Printful fulfillment worker added in a later phase.
  return json({ error: "Bestell-Endpunkt nicht gefunden." }, 404);
}


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

async function audit(env, userId, action, partnerId, details = null) {
  await env.DB.prepare(`
    INSERT INTO audit_logs (
      id, user_id, action, entity_type, entity_id, details
    )
    VALUES (?, ?, ?, 'partner', ?, ?)
  `).bind(
    crypto.randomUUID(),
    userId,
    action,
    partnerId,
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

function validatePartner(body, partial = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Ungültige Anfrage.";
  }

  if (!partial || body.name !== undefined) {
    if (
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.trim().length > 180
    ) {
      return "Der Name muss zwischen 1 und 180 Zeichen lang sein.";
    }
  }

  if (
    body.description !== undefined &&
    body.description !== null &&
    (typeof body.description !== "string" || body.description.length > 5000)
  ) {
    return "Die Beschreibung darf maximal 5.000 Zeichen enthalten.";
  }

  if (body.website_url !== undefined && body.website_url !== null) {
    if (typeof body.website_url !== "string" || body.website_url.length > 1000) {
      return "Ungültige Website-Adresse.";
    }

    if (body.website_url.trim()) {
      try {
        const website = new URL(body.website_url.trim());

        if (!["http:", "https:"].includes(website.protocol)) {
          return "Die Website-Adresse muss mit http:// oder https:// beginnen.";
        }
      } catch {
        return "Bitte gib eine gültige Website-Adresse ein.";
      }
    }
  }

  if (
    body.logo_key !== undefined &&
    body.logo_key !== null &&
    (typeof body.logo_key !== "string" || body.logo_key.length > 500)
  ) {
    return "Ungültiger Logo-Verweis.";
  }

  return null;
}

export async function handlePartnersApi(request, env, auth) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const method = request.method.toUpperCase();

  const current = await getUser(request, env, auth);

  if (current.error) return current.error;

  // GET /api/admin/partners – Partnerübersicht
  if (path === "/api/admin/partners" && method === "GET") {
    if (!can(current, "partners.view")) {
      return json({ error: "Keine Berechtigung zum Anzeigen von Partnern." }, 403);
    }

    const result = await env.DB.prepare(`
      SELECT
        id,
        name,
        description,
        website_url,
        logo_key,
        status,
        created_at,
        updated_at
      FROM partners
      ORDER BY updated_at DESC
    `).all();

    return json({
      success: true,
      partners: result.results
    });
  }

  // POST /api/admin/partners – neuen Partner erstellen
  if (path === "/api/admin/partners" && method === "POST") {
    if (!can(current, "partners.create")) {
      return json({ error: "Keine Berechtigung zum Erstellen von Partnern." }, 403);
    }

    const body = await readBody(request);
    const validationError = validatePartner(body);

    if (validationError) {
      return json({ error: validationError }, 400);
    }

    const id = crypto.randomUUID();

    await env.DB.prepare(`
      INSERT INTO partners (
        id,
        name,
        description,
        website_url,
        logo_key,
        status
      )
      VALUES (?, ?, ?, ?, ?, 'inactive')
    `).bind(
      id,
      body.name.trim(),
      body.description?.trim() || null,
      body.website_url?.trim() || null,
      body.logo_key?.trim() || null
    ).run();

    await audit(env, current.user.id, "partner.created", id, {
      name: body.name.trim()
    });

    return json({
      success: true,
      message: "Partner wurde erstellt.",
      id
    }, 201);
  }

  const idMatch = path.match(/^\/api\/admin\/partners\/([^/]+)$/);

  // Einzelnen Partner lesen
  if (idMatch && method === "GET") {
    if (!can(current, "partners.view")) {
      return json({ error: "Keine Berechtigung zum Anzeigen von Partnern." }, 403);
    }

    const partner = await env.DB.prepare(`
      SELECT * FROM partners WHERE id = ?
    `).bind(idMatch[1]).first();

    if (!partner) {
      return json({ error: "Partner nicht gefunden." }, 404);
    }

    return json({
      success: true,
      partner
    });
  }

  // Partner bearbeiten
  if (idMatch && method === "PATCH") {
    if (!can(current, "partners.edit")) {
      return json({ error: "Keine Berechtigung zum Bearbeiten von Partnern." }, 403);
    }

    const id = idMatch[1];
    const body = await readBody(request);
    const validationError = validatePartner(body, true);

    if (validationError) {
      return json({ error: validationError }, 400);
    }

    const existing = await env.DB.prepare(`
      SELECT id, name, description, website_url, logo_key
      FROM partners
      WHERE id = ?
    `).bind(id).first();

    if (!existing) {
      return json({ error: "Partner nicht gefunden." }, 404);
    }

    const name = body.name !== undefined
      ? body.name.trim()
      : existing.name;

    const description = body.description !== undefined
      ? body.description?.trim() || null
      : existing.description;

    const websiteUrl = body.website_url !== undefined
      ? body.website_url?.trim() || null
      : existing.website_url;

    const logoKey = body.logo_key !== undefined
      ? body.logo_key?.trim() || null
      : existing.logo_key;

    await env.DB.prepare(`
      UPDATE partners
      SET
        name = ?,
        description = ?,
        website_url = ?,
        logo_key = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      name,
      description,
      websiteUrl,
      logoKey,
      id
    ).run();

    await audit(env, current.user.id, "partner.updated", id, {
      name
    });

    return json({
      success: true,
      message: "Partner wurde aktualisiert."
    });
  }

  // Partner aktivieren oder deaktivieren
  const actionMatch = path.match(
    /^\/api\/admin\/partners\/([^/]+)\/(activate|deactivate)$/
  );

  if (actionMatch && method === "POST") {
    if (!can(current, "partners.publish")) {
      return json({ error: "Keine Berechtigung zum Ändern des Partnerstatus." }, 403);
    }

    const id = actionMatch[1];
    const action = actionMatch[2];
    const newStatus = action === "activate" ? "active" : "inactive";

    const partner = await env.DB.prepare(`
      SELECT id, name, status
      FROM partners
      WHERE id = ?
    `).bind(id).first();

    if (!partner) {
      return json({ error: "Partner nicht gefunden." }, 404);
    }

    await env.DB.prepare(`
      UPDATE partners
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(newStatus, id).run();

    await audit(env, current.user.id, `partner.${action}`, id, {
      name: partner.name,
      status: newStatus
    });

    return json({
      success: true,
      message: newStatus === "active"
        ? "Partner wurde aktiviert."
        : "Partner wurde deaktiviert."
    });
  }

  // Partner löschen
  if (idMatch && method === "DELETE") {
    if (!can(current, "partners.delete")) {
      return json({ error: "Keine Berechtigung zum Löschen von Partnern." }, 403);
    }

    const id = idMatch[1];

    const partner = await env.DB.prepare(`
      SELECT id, name
      FROM partners
      WHERE id = ?
    `).bind(id).first();

    if (!partner) {
      return json({ error: "Partner nicht gefunden." }, 404);
    }

    await env.DB.prepare(`
      DELETE FROM partners
      WHERE id = ?
    `).bind(id).run();

    await audit(env, current.user.id, "partner.deleted", id, {
      name: partner.name
    });

    return json({
      success: true,
      message: "Partner wurde gelöscht."
    });
  }

  return json({ error: "Partner-Endpunkt nicht gefunden." }, 404);
}

// Öffentliche Partner-API
export async function handlePublicPartnersApi(request, env) {
  if (request.method.toUpperCase() !== "GET") {
    return json({ error: "Methode nicht erlaubt." }, 405);
  }

  const result = await env.DB.prepare(`
    SELECT
      id,
      name,
      description,
      website_url,
      logo_key
    FROM partners
    WHERE status = 'active'
    ORDER BY name ASC
  `).all();

  return json({
    success: true,
    partners: result.results
  });
}


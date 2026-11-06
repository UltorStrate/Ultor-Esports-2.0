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

async function audit(env, userId, action, newsId, details = null) {
  await env.DB.prepare(`
    INSERT INTO audit_logs (
      id, user_id, action, entity_type, entity_id, details
    )
    VALUES (?, ?, ?, 'news', ?, ?)
  `).bind(
    crypto.randomUUID(),
    userId,
    action,
    newsId,
    details ? JSON.stringify(details) : null
  ).run();
}

function makeSlug(title) {
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);

  return `${base || "news"}-${crypto.randomUUID().slice(0, 8)}`;
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function validateNews(body, partial = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Ungültige Anfrage.";
  }

  if (!partial || body.title !== undefined) {
    if (
      typeof body.title !== "string" ||
      !body.title.trim() ||
      body.title.trim().length > 180
    ) {
      return "Der Titel muss zwischen 1 und 180 Zeichen lang sein.";
    }
  }

  if (!partial || body.content !== undefined) {
    if (
      typeof body.content !== "string" ||
      !body.content.trim() ||
      body.content.length > 100000
    ) {
      return "Der Inhalt darf nicht leer sein und maximal 100.000 Zeichen enthalten.";
    }
  }

  if (body.excerpt !== undefined &&
      body.excerpt !== null &&
      (typeof body.excerpt !== "string" || body.excerpt.length > 500)) {
    return "Der Teaser darf maximal 500 Zeichen enthalten.";
  }

  if (body.image_key !== undefined &&
      body.image_key !== null &&
      (typeof body.image_key !== "string" || body.image_key.length > 500)) {
    return "Ungültiger Bildverweis.";
  }

  return null;
}

export async function handleNewsApi(request, env, auth) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const method = request.method.toUpperCase();

  const current = await getUser(request, env, auth);

  if (current.error) return current.error;

  // GET /api/admin/news – Beitragsübersicht
  if (path === "/api/admin/news" && method === "GET") {
    if (!can(current, "news.view")) {
      return json({ error: "Keine Berechtigung zum Anzeigen von News." }, 403);
    }

    const status = url.searchParams.get("status");
    const allowed = ["draft", "pending", "published", "archived"];

    if (status && !allowed.includes(status)) {
      return json({ error: "Ungültiger News-Status." }, 400);
    }

    let query = `
      SELECT
        n.id, n.title, n.slug, n.excerpt, n.image_key,
        n.status, n.author_id, n.published_by,
        n.published_at, n.created_at, n.updated_at,
        u.name AS author_name
      FROM news n
      LEFT JOIN users u ON u.id = n.author_id
    `;

    const values = [];

    if (status) {
      query += " WHERE n.status = ?";
      values.push(status);
    }

    query += " ORDER BY n.updated_at DESC";

    const result = await env.DB.prepare(query).bind(...values).all();

    return json({ success: true, news: result.results });
  }

  // POST /api/admin/news – neuen Entwurf erstellen
  if (path === "/api/admin/news" && method === "POST") {
    if (!can(current, "news.create")) {
      return json({ error: "Keine Berechtigung zum Erstellen von News." }, 403);
    }

    const body = await readBody(request);
    const validationError = validateNews(body);

    if (validationError) return json({ error: validationError }, 400);

    const id = crypto.randomUUID();
    const slug = makeSlug(body.title);

    await env.DB.prepare(`
      INSERT INTO news (
        id, title, slug, excerpt, content, image_key,
        status, author_id
      )
      VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)
    `).bind(
      id,
      body.title.trim(),
      slug,
      body.excerpt?.trim() || null,
      body.content,
      body.image_key?.trim() || null,
      current.user.id
    ).run();

    await audit(env, current.user.id, "news.created", id, {
      title: body.title.trim()
    });

    return json({
      success: true,
      message: "News-Entwurf wurde erstellt.",
      id,
      slug
    }, 201);
  }

  const idMatch = path.match(/^\/api\/admin\/news\/([^/]+)$/);

  // Einzelnen Beitrag lesen
  if (idMatch && method === "GET") {
    if (!can(current, "news.view")) {
      return json({ error: "Keine Berechtigung zum Anzeigen von News." }, 403);
    }

    const item = await env.DB.prepare(`
      SELECT * FROM news WHERE id = ?
    `).bind(idMatch[1]).first();

    if (!item) return json({ error: "News nicht gefunden." }, 404);

    return json({ success: true, news: item });
  }

  // Beitrag bearbeiten
  if (idMatch && method === "PATCH") {
    if (!can(current, "news.edit")) {
      return json({ error: "Keine Berechtigung zum Bearbeiten von News." }, 403);
    }

    const id = idMatch[1];
    const body = await readBody(request);
    const validationError = validateNews(body, true);

    if (validationError) return json({ error: validationError }, 400);

    const existing = await env.DB.prepare(`
      SELECT id, status, title, excerpt, content, image_key
      FROM news WHERE id = ?
    `).bind(id).first();

    if (!existing) return json({ error: "News nicht gefunden." }, 404);

    if (existing.status === "published" || existing.status === "archived") {
      return json({
        error: "Veröffentlichte oder archivierte Beiträge müssen zuerst als Entwurf bearbeitet werden."
      }, 409);
    }

    const title = body.title !== undefined ? body.title.trim() : existing.title;
    const excerpt = body.excerpt !== undefined ? body.excerpt : existing.excerpt;
    const content = body.content !== undefined ? body.content : existing.content;
    const imageKey = body.image_key !== undefined ? body.image_key : existing.image_key;

    await env.DB.prepare(`
      UPDATE news
      SET title = ?, excerpt = ?, content = ?, image_key = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(title, excerpt, content, imageKey, id).run();

    await audit(env, current.user.id, "news.updated", id, { title });

    return json({ success: true, message: "News wurde aktualisiert." });
  }

  // Aktionen: einreichen, veröffentlichen, archivieren, zurück in Entwurf
  const actionMatch = path.match(
    /^\/api\/admin\/news\/([^/]+)\/(submit|publish|archive|unpublish)$/
  );

  if (actionMatch && method === "POST") {
    const id = actionMatch[1];
    const action = actionMatch[2];

    const item = await env.DB.prepare(`
      SELECT id, title, status
      FROM news WHERE id = ?
    `).bind(id).first();

    if (!item) return json({ error: "News nicht gefunden." }, 404);

    let newStatus;
    let requiredPermission;

    if (action === "submit") {
      requiredPermission = "news.edit";
      newStatus = "pending";

      if (item.status !== "draft") {
        return json({ error: "Nur Entwürfe können eingereicht werden." }, 409);
      }
    }

    if (action === "publish") {
      requiredPermission = "news.publish";
      newStatus = "published";

      if (item.status !== "pending" && item.status !== "draft") {
        return json({ error: "Dieser Beitrag kann nicht veröffentlicht werden." }, 409);
      }
    }

    if (action === "archive") {
      requiredPermission = "news.publish";
      newStatus = "archived";

      if (item.status !== "published") {
        return json({ error: "Nur veröffentlichte Beiträge können archiviert werden." }, 409);
      }
    }

    if (action === "unpublish") {
      requiredPermission = "news.publish";
      newStatus = "draft";

      if (item.status !== "published") {
        return json({ error: "Nur veröffentlichte Beiträge können zurückgezogen werden." }, 409);
      }
    }

    if (!can(current, requiredPermission)) {
      return json({ error: "Keine Berechtigung für diese Aktion." }, 403);
    }

    await env.DB.prepare(`
      UPDATE news
      SET status = ?,
          published_by = CASE WHEN ? = 'published' THEN ? ELSE published_by END,
          published_at = CASE WHEN ? = 'published' THEN CURRENT_TIMESTAMP ELSE published_at END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      newStatus,
      newStatus,
      current.user.id,
      newStatus,
      id
    ).run();

    await audit(env, current.user.id, `news.${action}`, id, {
      title: item.title,
      status: newStatus
    });

    return json({
      success: true,
      message: `Beitragsstatus: ${newStatus}`
    });
  }

  // Beitrag löschen
  if (idMatch && method === "DELETE") {
    if (!can(current, "news.delete")) {
      return json({ error: "Keine Berechtigung zum Löschen von News." }, 403);
    }

    const id = idMatch[1];

    const item = await env.DB.prepare(`
      SELECT id, title FROM news WHERE id = ?
    `).bind(id).first();

    if (!item) return json({ error: "News nicht gefunden." }, 404);

    await env.DB.prepare(`
      DELETE FROM news WHERE id = ?
    `).bind(id).run();

    await audit(env, current.user.id, "news.deleted", id, {
      title: item.title
    });

    return json({ success: true, message: "News wurde gelöscht." });
  }

  return json({ error: "News-Endpunkt nicht gefunden." }, 404);
}

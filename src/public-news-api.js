
function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=60"
    }
  });
}

export async function handlePublicNewsApi(request, env) {
  if (request.method !== "GET") {
    return json({ error: "Methode nicht erlaubt." }, 405);
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");

  // Einzelnen veröffentlichten Artikel anhand des Slugs laden
  const articleMatch = path.match(/^\/api\/news\/([^/]+)$/);

  if (articleMatch) {
    const slug = decodeURIComponent(articleMatch[1]);

    const article = await env.DB.prepare(`
      SELECT
        n.id,
        n.title,
        n.slug,
        n.excerpt,
        n.content,
        n.image_key,
        n.published_at,
        u.name AS author_name
      FROM news n
      LEFT JOIN users u ON u.id = n.author_id
      WHERE n.slug = ?
        AND n.status = 'published'
      LIMIT 1
    `).bind(slug).first();

    if (!article) {
      return json({ error: "Beitrag nicht gefunden." }, 404);
    }

    return json({ success: true, article });
  }

  // Öffentliche News-Übersicht
  if (path === "/api/news") {
    const result = await env.DB.prepare(`
      SELECT
        n.id,
        n.title,
        n.slug,
        n.excerpt,
        n.image_key,
        n.published_at,
        u.name AS author_name
      FROM news n
      LEFT JOIN users u ON u.id = n.author_id
      WHERE n.status = 'published'
      ORDER BY n.published_at DESC
      LIMIT 100
    `).all();

    return json({
      success: true,
      news: result.results
    });
  }

  return json({ error: "News-Endpunkt nicht gefunden." }, 404);
}


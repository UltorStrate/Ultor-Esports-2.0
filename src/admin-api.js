
export async function handleAdminApi(request, env, auth) {
  const url = new URL(request.url);

  // Nur angemeldete Benutzer dürfen die CMS-API verwenden.
  const session = await auth.api.getSession({
    headers: request.headers
  });

  if (!session?.user) {
    return Response.json(
      { error: "Nicht angemeldet" },
      { status: 401 }
    );
  }

  // CMS-Benutzer anhand der Better-Auth-ID suchen.
  const cmsUser = await env.DB.prepare(
    "SELECT id, name, email, status, is_owner FROM users WHERE id = ?"
  )
    .bind(session.user.id)
    .first();

  if (
    !cmsUser ||
    cmsUser.status !== "approved"
  ) {
    return Response.json(
      { error: "Zugriff nicht freigegeben" },
      { status: 403 }
    );
  }

  // Owner darf alle CMS-Funktionen verwenden.
  if (cmsUser.is_owner === 1) {
    return Response.json({
      success: true,
      user: cmsUser,
      permissions: ["*"]
    });
  }

  // Individuelle Berechtigungen laden.
  const result = await env.DB.prepare(`
    SELECT p.name
    FROM user_permissions up
    JOIN permissions p ON p.id = up.permission_id
    WHERE up.user_id = ?
  `)
    .bind(cmsUser.id)
    .all();

  return Response.json({
    success: true,
    user: cmsUser,
    permissions: result.results.map(row => row.name)
  });
}


function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

async function writeAuditLog(env, userId, action, entityType, entityId, details = null) {
  await env.DB.prepare(`
    INSERT INTO audit_logs (
      id,
      user_id,
      action,
      entity_type,
      entity_id,
      details
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `)
    .bind(
      crypto.randomUUID(),
      userId,
      action,
      entityType,
      entityId,
      details ? JSON.stringify(details) : null
    )
    .run();
}

async function getCurrentUser(request, env, auth) {
  const session = await auth.api.getSession({
    headers: request.headers
  });

  if (!session?.user) {
    return {
      error: json({ error: "Nicht angemeldet" }, 401)
    };
  }

  const user = await env.DB.prepare(`
    SELECT id, name, email, status, is_owner
    FROM users
    WHERE id = ?
  `)
    .bind(session.user.id)
    .first();

  if (!user || user.status !== "approved") {
    return {
      error: json({ error: "Zugriff nicht freigegeben" }, 403)
    };
  }

  const permissionsResult = await env.DB.prepare(`
    SELECT p.name
    FROM user_permissions up
    JOIN permissions p ON p.id = up.permission_id
    WHERE up.user_id = ?
  `)
    .bind(user.id)
    .all();

  return {
    user,
    permissions: user.is_owner === 1
      ? ["*"]
      : permissionsResult.results.map(row => row.name)
  };
}

function can(current, permission) {
  return (
    current.user.is_owner === 1 ||
    current.permissions.includes("*") ||
    current.permissions.includes(permission)
  );
}

async function requireOwner(current) {
  return current.user.is_owner === 1;
}

export async function handleAdminApi(request, env, auth) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();

  const current = await getCurrentUser(request, env, auth);

  if (current.error) {
    return current.error;
  }

  // Eigenes Benutzerprofil und Berechtigungen
  if (path === "/api/admin/me" && method === "GET") {
    return json({
      success: true,
      user: current.user,
      permissions: current.permissions
    });
  }

  // Benutzerliste – nur Owner
  if (path === "/api/admin/users" && method === "GET") {
    if (!(await requireOwner(current))) {
      return json({ error: "Nur der Owner darf Benutzer verwalten" }, 403);
    }

    const status = url.searchParams.get("status") || "pending";
    const allowedStatuses = ["pending", "approved", "rejected", "suspended"];

    if (!allowedStatuses.includes(status)) {
      return json({ error: "Ungültiger Benutzerstatus" }, 400);
    }

    const result = await env.DB.prepare(`
      SELECT id, name, email, status, is_owner, created_at, approved_at
      FROM users
      WHERE status = ?
      ORDER BY created_at DESC
    `)
      .bind(status)
      .all();

    return json({
      success: true,
      users: result.results
    });
  }

  // Benutzer freigeben, ablehnen oder sperren
  const userActionMatch = path.match(
    /^\/api\/admin\/users\/([^/]+)\/(approve|reject|suspend)$/
  );

  if (userActionMatch && method === "POST") {
    if (!(await requireOwner(current))) {
      return json({ error: "Nur der Owner darf Benutzer verwalten" }, 403);
    }

    const targetUserId = userActionMatch[1];
    const action = userActionMatch[2];

    if (targetUserId === current.user.id) {
      return json({ error: "Diese Aktion ist für das eigene Konto nicht erlaubt" }, 400);
    }

    const targetUser = await env.DB.prepare(`
      SELECT id, email, status, is_owner
      FROM users
      WHERE id = ?
    `)
      .bind(targetUserId)
      .first();

    if (!targetUser) {
      return json({ error: "Benutzer nicht gefunden" }, 404);
    }

    if (targetUser.is_owner === 1) {
      return json({ error: "Der Owner kann nicht über diese Funktion verändert werden" }, 403);
    }

    const newStatus = {
      approve: "approved",
      reject: "rejected",
      suspend: "suspended"
    }[action];

    await env.DB.prepare(`
      UPDATE users
      SET
        status = ?,
        approved_at = CASE WHEN ? = 'approved' THEN CURRENT_TIMESTAMP ELSE approved_at END,
        approved_by = CASE WHEN ? = 'approved' THEN ? ELSE approved_by END
      WHERE id = ?
    `)
      .bind(
        newStatus,
        newStatus,
        newStatus,
        current.user.id,
        targetUserId
      )
      .run();

    await writeAuditLog(
      env,
      current.user.id,
      `user.${action}`,
      "user",
      targetUserId,
      { email: targetUser.email }
    );

    return json({
      success: true,
      message: `Benutzerstatus wurde auf ${newStatus} gesetzt`
    });
  }

  // Berechtigungen eines Benutzers vollständig ersetzen
  const permissionsMatch = path.match(
    /^\/api\/admin\/users\/([^/]+)\/permissions$/
  );

  if (permissionsMatch && method === "POST") {
    if (!(await requireOwner(current))) {
      return json({ error: "Nur der Owner darf Berechtigungen vergeben" }, 403);
    }

    const targetUserId = permissionsMatch[1];

    if (targetUserId === current.user.id) {
      return json({ error: "Die eigenen Berechtigungen können hier nicht verändert werden" }, 400);
    }

    const targetUser = await env.DB.prepare(`
      SELECT id, is_owner
      FROM users
      WHERE id = ?
    `)
      .bind(targetUserId)
      .first();

    if (!targetUser) {
      return json({ error: "Benutzer nicht gefunden" }, 404);
    }

    if (targetUser.is_owner === 1) {
      return json({ error: "Die Berechtigungen des Owners können nicht verändert werden" }, 403);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return json({ error: "Ungültiger JSON-Body" }, 400);
    }

    if (!Array.isArray(body.permissions)) {
      return json({ error: "permissions muss eine Liste sein" }, 400);
    }

    const permissionNames = [...new Set(body.permissions)];

    const knownPermissions = await env.DB.prepare(`
      SELECT id, name
      FROM permissions
    `).all();

    const permissionMap = new Map(
      knownPermissions.results.map(permission => [
        permission.name,
        permission.id
      ])
    );

    const unknownPermissions = permissionNames.filter(
      name => !permissionMap.has(name)
    );

    if (unknownPermissions.length > 0) {
      return json({
        error: "Unbekannte Berechtigungen",
        permissions: unknownPermissions
      }, 400);
    }

    const statements = [
      env.DB.prepare(`
        DELETE FROM user_permissions
        WHERE user_id = ?
      `).bind(targetUserId)
    ];

    for (const name of permissionNames) {
      statements.push(
        env.DB.prepare(`
          INSERT INTO user_permissions (
            user_id,
            permission_id,
            granted_by
          )
          VALUES (?, ?, ?)
        `).bind(
          targetUserId,
          permissionMap.get(name),
          current.user.id
        )
      );
    }

    await env.DB.batch(statements);

    await writeAuditLog(
      env,
      current.user.id,
      "user.permissions.updated",
      "user",
      targetUserId,
      { permissions: permissionNames }
    );

    return json({
      success: true,
      permissions: permissionNames
    });
  }

  return json({ error: "API-Endpunkt nicht gefunden" }, 404);
}

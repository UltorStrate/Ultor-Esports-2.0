
function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

// =========================================
// AUTHENTIFIZIERUNG
// =========================================

async function getCurrentUser(request, env, auth) {
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

function hasPermission(current, permission) {
  return current.permissions.includes("*") ||
    current.permissions.includes(permission);
}

// =========================================
// HILFSFUNKTIONEN
// =========================================

async function audit(env, userId, action, entityType, entityId, details = null) {
  await env.DB.prepare(`
    INSERT INTO audit_logs (
      id, user_id, action, entity_type, entity_id, details
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    userId,
    action,
    entityType,
    entityId,
    details ? JSON.stringify(details) : null
  ).run();
}

async function writeHistory(
  env,
  teamId,
  playerId,
  action,
  description,
  userId
) {
  await env.DB.prepare(`
    INSERT INTO roster_history (
      id, team_id, player_id, action,
      description, changed_by, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(
    crypto.randomUUID(),
    teamId,
    playerId,
    action,
    description,
    userId
  ).run();
}

async function readBody(request) {
  try {
    const body = await request.json();

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return null;
    }

    return body;
  } catch {
    return null;
  }
}

function cleanText(value, maxLength = 5000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function makeSlug(value) {
  return cleanText(value, 120)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function createUniqueSlug(env, name, excludeId = null) {
  const base = makeSlug(name);

  if (!base) return null;

  let slug = base;
  let suffix = 2;

  while (true) {
    const existing = await env.DB.prepare(`
      SELECT id
      FROM teams
      WHERE slug = ?
      AND (? IS NULL OR id != ?)
    `).bind(slug, excludeId, excludeId).first();

    if (!existing) return slug;

    slug = `${base}-${suffix}`;

    suffix++;

    if (suffix > 1000) {
      throw new Error("Kein eindeutiger Team-Slug verfügbar.");
    }
  }
}

function validId(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128;
}

function validStatus(status) {
  return ["active", "inactive", "draft"].includes(status);
}

// =========================================
// HAUPT-API
// =========================================

export async function handleTeamsApi(request, env, auth) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();

  const current = await getCurrentUser(request, env, auth);

  if (current.error) return current.error;

  // =========================================
  // TEAMS ABRUFEN
  // =========================================

  if (path === "/api/admin/teams" && method === "GET") {
    if (!hasPermission(current, "teams.view")) {
      return json({ error: "Keine Berechtigung für Teams." }, 403);
    }

    const result = await env.DB.prepare(`
      SELECT
        t.*,
        (
          SELECT COUNT(*)
          FROM players p
          WHERE p.team_id = t.id
        ) AS player_count
      FROM teams t
      ORDER BY t.name COLLATE NOCASE ASC
    `).all();

    return json({
      success: true,
      teams: result.results
    });
  }

  // =========================================
  // TEAM ERSTELLEN
  // =========================================

  if (path === "/api/admin/teams" && method === "POST") {
    if (!hasPermission(current, "teams.create")) {
      return json({ error: "Keine Berechtigung zum Erstellen von Teams." }, 403);
    }

    const body = await readBody(request);

    if (!body) {
      return json({ error: "Ungültiger JSON-Body." }, 400);
    }

    const name = cleanText(body.name, 120);
    const description = cleanText(body.description, 5000);
    const logoKey = cleanText(body.logo_key, 500);
    const status = body.status || "active";

    if (!name) {
      return json({ error: "Ein Teamname ist erforderlich." }, 400);
    }

    if (!validStatus(status)) {
      return json({ error: "Ungültiger Teamstatus." }, 400);
    }

    const slug = await createUniqueSlug(env, name);
    const id = crypto.randomUUID();

    await env.DB.prepare(`
      INSERT INTO teams (
        id, name, slug, description, logo_key,
        status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      id,
      name,
      slug,
      description || null,
      logoKey || null,
      status
    ).run();

    await audit(
      env,
      current.user.id,
      "team.created",
      "team",
      id,
      { name, slug }
    );

    return json({
      success: true,
      message: "Team wurde erstellt.",
      team: {
        id,
        name,
        slug,
        description,
        logo_key: logoKey || null,
        status
      }
    }, 201);
  }

  // =========================================
  // TEAM BEARBEITEN / LÖSCHEN
  // =========================================

  const teamMatch = path.match(/^\/api\/admin\/teams\/([^/]+)$/);

  if (teamMatch) {
    const teamId = teamMatch[1];

    if (!validId(teamId)) {
      return json({ error: "Ungültige Team-ID." }, 400);
    }

    const team = await env.DB.prepare(`
      SELECT * FROM teams WHERE id = ?
    `).bind(teamId).first();

    if (!team) {
      return json({ error: "Team nicht gefunden." }, 404);
    }

    if (method === "PATCH") {
      if (!hasPermission(current, "teams.edit")) {
        return json({ error: "Keine Berechtigung zum Bearbeiten von Teams." }, 403);
      }

      const body = await readBody(request);

      if (!body) {
        return json({ error: "Ungültiger JSON-Body." }, 400);
      }

      const name = body.name !== undefined
        ? cleanText(body.name, 120)
        : team.name;

      const description = body.description !== undefined
        ? cleanText(body.description, 5000)
        : team.description;

      const logoKey = body.logo_key !== undefined
        ? cleanText(body.logo_key, 500)
        : team.logo_key;

      const status = body.status !== undefined
        ? body.status
        : team.status;

      if (!name) {
        return json({ error: "Ein Teamname ist erforderlich." }, 400);
      }

      if (!validStatus(status)) {
        return json({ error: "Ungültiger Teamstatus." }, 400);
      }

      const slug = name !== team.name
        ? await createUniqueSlug(env, name, teamId)
        : team.slug;

      await env.DB.prepare(`
        UPDATE teams
        SET
          name = ?,
          slug = ?,
          description = ?,
          logo_key = ?,
          status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        name,
        slug,
        description || null,
        logoKey || null,
        status,
        teamId
      ).run();

      await audit(
        env,
        current.user.id,
        "team.updated",
        "team",
        teamId,
        { name, slug, status }
      );

      return json({
        success: true,
        message: "Team wurde aktualisiert."
      });
    }

    if (method === "DELETE") {
      if (!hasPermission(current, "teams.delete")) {
        return json({ error: "Keine Berechtigung zum Löschen von Teams." }, 403);
      }

      const players = await env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM players
        WHERE team_id = ?
      `).bind(teamId).first();

      if (players.total > 0) {
        return json({
          error: "Das Team enthält noch Spieler. Entferne oder verschiebe diese zuerst."
        }, 409);
      }

      const history = await env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM roster_history
        WHERE team_id = ?
      `).bind(teamId).first();

      if (history.total > 0) {
        await env.DB.prepare(`
          UPDATE teams
          SET status = 'inactive',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(teamId).run();

        await audit(
          env,
          current.user.id,
          "team.deactivated",
          "team",
          teamId,
          { name: team.name }
        );

        return json({
          success: true,
          message: "Team wurde deaktiviert. Die Kaderhistorie bleibt erhalten."
        });
      }

      await env.DB.prepare(`
        DELETE FROM teams WHERE id = ?
      `).bind(teamId).run();

      await audit(
        env,
        current.user.id,
        "team.deleted",
        "team",
        teamId,
        { name: team.name }
      );

      return json({
        success: true,
        message: "Team wurde gelöscht."
      });
    }
  }

  // =========================================
  // SPIELER ABRUFEN
  // =========================================

  if (path === "/api/admin/players" && method === "GET") {
    if (!hasPermission(current, "teams.view")) {
      return json({ error: "Keine Berechtigung für Spieler." }, 403);
    }

    const teamId = url.searchParams.get("team_id");

    let result;

    if (teamId) {
      result = await env.DB.prepare(`
        SELECT p.*, t.name AS team_name
        FROM players p
        LEFT JOIN teams t ON t.id = p.team_id
        WHERE p.team_id = ?
        ORDER BY p.is_substitute ASC, p.name COLLATE NOCASE ASC
      `).bind(teamId).all();
    } else {
      result = await env.DB.prepare(`
        SELECT p.*, t.name AS team_name
        FROM players p
        LEFT JOIN teams t ON t.id = p.team_id
        ORDER BY
          t.name COLLATE NOCASE ASC,
          p.is_substitute ASC,
          p.name COLLATE NOCASE ASC
      `).all();
    }

    return json({
      success: true,
      players: result.results
    });
  }

  // =========================================
  // SPIELER HINZUFÜGEN
  // =========================================

  if (path === "/api/admin/players" && method === "POST") {
    if (!hasPermission(current, "teams.edit")) {
      return json({ error: "Keine Berechtigung zum Hinzufügen von Spielern." }, 403);
    }

    const body = await readBody(request);

    if (!body) {
      return json({ error: "Ungültiger JSON-Body." }, 400);
    }

    const name = cleanText(body.name, 120);
    const position = cleanText(body.position, 80);
    const teamId = cleanText(body.team_id, 128);
    const imageKey = cleanText(body.image_key, 500);

    const isSubstitute =
      body.is_substitute === true || body.is_substitute === 1
        ? 1
        : 0;

    if (!name || !teamId) {
      return json({
        error: "Spielername und Team sind erforderlich."
      }, 400);
    }

    const team = await env.DB.prepare(`
      SELECT id, name FROM teams WHERE id = ?
    `).bind(teamId).first();

    if (!team) {
      return json({ error: "Team nicht gefunden." }, 404);
    }

    const id = crypto.randomUUID();

    await env.DB.prepare(`
      INSERT INTO players (
        id, team_id, name, position, image_key,
        is_substitute, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      id,
      teamId,
      name,
      position || null,
      imageKey || null,
      isSubstitute
    ).run();

    await writeHistory(
      env,
      teamId,
      id,
      "joined",
      `${name} wurde dem Team ${team.name} hinzugefügt.`,
      current.user.id
    );

    await audit(
      env,
      current.user.id,
      "player.created",
      "player",
      id,
      { name, teamId }
    );

    return json({
      success: true,
      message: "Spieler wurde hinzugefügt.",
      player: {
        id,
        team_id: teamId,
        name,
        position,
        image_key: imageKey || null,
        is_substitute: isSubstitute
      }
    }, 201);
  }

  // =========================================
  // SPIELER BEARBEITEN / ENTFERNEN
  // =========================================

  const playerMatch = path.match(/^\/api\/admin\/players\/([^/]+)$/);

  if (playerMatch) {
    const playerId = playerMatch[1];

    if (!validId(playerId)) {
      return json({ error: "Ungültige Spieler-ID." }, 400);
    }

    const player = await env.DB.prepare(`
      SELECT * FROM players WHERE id = ?
    `).bind(playerId).first();

    if (!player) {
      return json({ error: "Spieler nicht gefunden." }, 404);
    }

    if (method === "PATCH") {
      if (!hasPermission(current, "teams.edit")) {
        return json({ error: "Keine Berechtigung zum Bearbeiten von Spielern." }, 403);
      }

      const body = await readBody(request);

      if (!body) {
        return json({ error: "Ungültiger JSON-Body." }, 400);
      }

      const name = body.name !== undefined
        ? cleanText(body.name, 120)
        : player.name;

      const position = body.position !== undefined
        ? cleanText(body.position, 80)
        : player.position;

      const teamId = body.team_id !== undefined
        ? cleanText(body.team_id, 128)
        : player.team_id;

      const imageKey = body.image_key !== undefined
        ? cleanText(body.image_key, 500)
        : player.image_key;

      const isSubstitute = body.is_substitute !== undefined
        ? (body.is_substitute === true || body.is_substitute === 1 ? 1 : 0)
        : player.is_substitute;

      if (!name || !teamId) {
        return json({
          error: "Spielername und Team sind erforderlich."
        }, 400);
      }

      const newTeam = await env.DB.prepare(`
        SELECT id, name FROM teams WHERE id = ?
      `).bind(teamId).first();

      if (!newTeam) {
        return json({ error: "Team nicht gefunden." }, 404);
      }

      await env.DB.prepare(`
        UPDATE players
        SET
          team_id = ?,
          name = ?,
          position = ?,
          image_key = ?,
          is_substitute = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        teamId,
        name,
        position || null,
        imageKey || null,
        isSubstitute,
        playerId
      ).run();

      if (teamId !== player.team_id) {
        const oldTeam = await env.DB.prepare(`
          SELECT name FROM teams WHERE id = ?
        `).bind(player.team_id).first();

        await writeHistory(
          env,
          player.team_id,
          playerId,
          "left",
          `${player.name} hat das Team ${oldTeam?.name || ""} verlassen.`,
          current.user.id
        );

        await writeHistory(
          env,
          teamId,
          playerId,
          "joined",
          `${name} ist dem Team ${newTeam.name} beigetreten.`,
          current.user.id
        );
      }

      await audit(
        env,
        current.user.id,
        "player.updated",
        "player",
        playerId,
        {
          name,
          oldTeamId: player.team_id,
          newTeamId: teamId
        }
      );

      return json({
        success: true,
        message: "Spieler wurde aktualisiert."
      });
    }

    if (method === "DELETE") {
      if (!hasPermission(current, "teams.edit")) {
        return json({ error: "Keine Berechtigung zum Entfernen von Spielern." }, 403);
      }

      const team = await env.DB.prepare(`
        SELECT name FROM teams WHERE id = ?
      `).bind(player.team_id).first();

      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO roster_history (
            id, team_id, player_id, action,
            description, changed_by, created_at
          )
          VALUES (?, ?, ?, 'left', ?, ?, CURRENT_TIMESTAMP)
        `).bind(
          crypto.randomUUID(),
          player.team_id,
          playerId,
          `${player.name} hat das Team ${team?.name || ""} verlassen.`,
          current.user.id
        ),
        env.DB.prepare(`
          DELETE FROM players WHERE id = ?
        `).bind(playerId)
      ]);

      await audit(
        env,
        current.user.id,
        "player.deleted",
        "player",
        playerId,
        {
          name: player.name,
          teamId: player.team_id
        }
      );

      return json({
        success: true,
        message: "Spieler wurde aus dem Team entfernt."
      });
    }
  }

  // =========================================
  // KADERHISTORIE ABRUFEN
  // =========================================

  if (path === "/api/admin/roster-history" && method === "GET") {
    if (!hasPermission(current, "teams.view")) {
      return json({
        error: "Keine Berechtigung für die Kaderhistorie."
      }, 403);
    }

    const teamId = url.searchParams.get("team_id");

    let result;

    if (teamId) {
      result = await env.DB.prepare(`
        SELECT
          rh.*,
          t.name AS team_name,
          u.name AS changed_by_name
        FROM roster_history rh
        LEFT JOIN teams t ON t.id = rh.team_id
        LEFT JOIN users u ON u.id = rh.changed_by
        WHERE rh.team_id = ?
        ORDER BY rh.created_at DESC
        LIMIT 100
      `).bind(teamId).all();
    } else {
      result = await env.DB.prepare(`
        SELECT
          rh.*,
          t.name AS team_name,
          u.name AS changed_by_name
        FROM roster_history rh
        LEFT JOIN teams t ON t.id = rh.team_id
        LEFT JOIN users u ON u.id = rh.changed_by
        ORDER BY rh.created_at DESC
        LIMIT 100
      `).all();
    }

    return json({
      success: true,
      history: result.results
    });
  }

  return json({
    error: "Teams-API-Endpunkt nicht gefunden."
  }, 404);
}
export async function handlePublicTeamsApi(request, env) {
  if (request.method !== "GET") {
    return publicJson({ error: "Methode nicht erlaubt." }, 405);
  }
  
export async function handlePublicTeamsApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();

  if (method !== "GET") {
    return json({ error: "Methode nicht erlaubt." }, 405);
  }

  // =========================================
  // ALLE AKTIVEN TEAMS ABRUFEN
  // =========================================

  if (path === "/api/teams") {
    const result = await env.DB.prepare(`
      SELECT
        t.id,
        t.name,
        t.slug,
        t.description,
        t.logo_key,
        t.status,
        (
          SELECT COUNT(*)
          FROM players p
          WHERE p.team_id = t.id
        ) AS player_count
      FROM teams t
      WHERE t.status = 'active'
      ORDER BY t.name COLLATE NOCASE ASC
    `).all();

    return json({
      success: true,
      teams: result.results
    });
  }

  // =========================================
  // EINZELNES TEAM MIT SPIELERN ABRUFEN
  // =========================================

  const match = path.match(/^\/api\/teams\/([a-z0-9-]+)$/);

  if (match) {
    const slug = match[1];

    const team = await env.DB.prepare(`
      SELECT
        id,
        name,
        slug,
        description,
        logo_key,
        status
      FROM teams
      WHERE slug = ?
      AND status = 'active'
    `).bind(slug).first();

    if (!team) {
      return json({ error: "Team nicht gefunden." }, 404);
    }

    const players = await env.DB.prepare(`
      SELECT
        id,
        name,
        position,
        image_key,
        is_substitute
      FROM players
      WHERE team_id = ?
      ORDER BY
        is_substitute ASC,
        name COLLATE NOCASE ASC
    `).bind(team.id).all();

    return json({
      success: true,
      team,
      players: players.results
    });
  }

  return json({
    error: "Öffentlicher Teams-Endpunkt nicht gefunden."
  }, 404);
}


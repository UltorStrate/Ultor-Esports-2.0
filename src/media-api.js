function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

async function getApprovedUser(request, env, auth) {
  const session = await auth.api.getSession({
    headers: request.headers
  });

  if (!session?.user) {
    return { error: json({ error: "Nicht angemeldet." }, 401) };
  }

  const user = await env.DB.prepare(`
    SELECT id, status, is_owner
    FROM users
    WHERE id = ?
  `).bind(session.user.id).first();

  if (!user || user.status !== "approved") {
    return { error: json({ error: "Zugriff nicht freigegeben." }, 403) };
  }

  if (user.is_owner === 1) return { user };

  const permission = await env.DB.prepare(`
    SELECT 1
    FROM user_permissions up
    JOIN permissions p ON p.id = up.permission_id
    WHERE up.user_id = ? AND p.name = 'media.upload'
  `).bind(user.id).first();

  if (!permission) {
    return { error: json({ error: "Keine Berechtigung zum Hochladen." }, 403) };
  }

  return { user };
}

function detectImage(bytes) {
  // JPEG
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) return { mime: "image/jpeg", extension: "jpg" };

  // PNG
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) return { mime: "image/png", extension: "png" };

  // GIF
  if (
    bytes.length >= 6 &&
    String.fromCharCode(...bytes.slice(0, 6)).match(/^GIF8[79]a$/)
  ) return { mime: "image/gif", extension: "gif" };

  // WEBP
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) return { mime: "image/webp", extension: "webp" };

  return null;
}

export async function handleMediaUpload(request, env, auth) {
  if (request.method !== "POST") {
    return json({ error: "Methode nicht erlaubt." }, 405);
  }

  if (!env.MEDIA) {
    return json({ error: "R2-Bucket MEDIA ist nicht verbunden." }, 500);
  }

  const current = await getApprovedUser(request, env, auth);
  if (current.error) return current.error;

  let formData;

  try {
    formData = await request.formData();
  } catch {
    return json({ error: "Ungültiger Datei-Upload." }, 400);
  }

  const file = formData.get("file");

  if (!file || typeof file.arrayBuffer !== "function") {
    return json({ error: "Es wurde keine Datei ausgewählt." }, 400);
  }

  if (file.size <= 0 || file.size > 8 * 1024 * 1024) {
    return json({ error: "Die Datei muss zwischen 1 Byte und 8 MB groß sein." }, 400);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = detectImage(bytes);

  if (!image) {
    return json({
      error: "Ungültiges Bild. Erlaubt sind JPG, PNG, WEBP und GIF."
    }, 400);
  }

  const id = crypto.randomUUID();

const requestedFolder = formData.get("folder") || "news";
const allowedFolders = ["news", "teams", "players"];

if (!allowedFolders.includes(requestedFolder)) {
  return json({ error: "Ungültiger Medienordner." }, 400);
}

const key = `${requestedFolder}/${id}.${image.extension}`;
  const fileName = String(file.name || `image.${image.extension}`)
    .replace(/[^\w.\- ]/g, "_")
    .slice(0, 180);

  try {
    await env.MEDIA.put(key, bytes, {
      httpMetadata: {
        contentType: image.mime,
        cacheControl: "public, max-age=31536000, immutable"
      },
      customMetadata: {
        uploadedBy: current.user.id
      }
    });

    await env.DB.prepare(`
      INSERT INTO media (
        id, file_name, file_key, mime_type, uploaded_by
      )
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      id,
      fileName,
      key,
      image.mime,
      current.user.id
    ).run();

    return json({
      success: true,
      message: "Bild wurde hochgeladen.",
      key,
      url: `/media/${key}`
    }, 201);

  } catch (error) {
    console.error("Media upload error:", error);

    try {
      await env.MEDIA.delete(key);
    } catch {}

    return json({ error: "Das Bild konnte nicht gespeichert werden." }, 500);
  }
}

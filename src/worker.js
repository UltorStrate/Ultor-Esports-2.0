import { createAuth } from "./auth.js";
import { handleAdminApi } from "./admin-api.js";
import { handleNewsApi } from "./news-api.js";
import { handleMediaUpload } from "./media-api.js";
import { handlePublicNewsApi } from "./public-news-api.js";
const BLOCKED_PREFIXES = [
  "/src",
  "/migrations",
  "/.git",
  "/.github",
  "/node_modules"
];

const BLOCKED_FILES = [
  "/package.json",
  "/wrangler.jsonc",
  "/bun.lock",
  "/bun.lockb"
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let pathname;

    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    const normalizedPath = pathname.toLowerCase();

    if (
      BLOCKED_PREFIXES.some(prefix =>
        normalizedPath === prefix ||
        normalizedPath.startsWith(prefix + "/")
      ) ||
      BLOCKED_FILES.includes(normalizedPath)
    ) {
      return new Response("Not Found", { status: 404 });
    }

    // Better Auth
    if (
      normalizedPath === "/api/auth" ||
      normalizedPath.startsWith("/api/auth/")
    ) {
      try {
        const auth = createAuth(env);
        return await auth.handler(request);
      } catch (error) {
        console.error("Authentication error:", error);
        return Response.json(
          { error: "Authentifizierungsfehler" },
          { status: 500 }
        );
      }
    }

    // Medien-Upload
    if (normalizedPath === "/api/admin/media/upload") {
      try {
        const auth = createAuth(env);
        return await handleMediaUpload(request, env, auth);
      } catch (error) {
        console.error("Media API error:", error);
        return Response.json(
          { error: "Fehler beim Medien-Upload." },
          { status: 500 }
        );
      }
    }

    // Öffentliche Bildauslieferung aus R2
    if (normalizedPath.startsWith("/media/")) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      const key = pathname.slice("/media/".length);

      if (!/^news\/[0-9a-f-]+\.(jpg|png|webp|gif)$/i.test(key)) {
        return new Response("Not Found", { status: 404 });
      }

      if (!env.MEDIA) {
        return new Response("Media storage unavailable", { status: 503 });
      }

      const object = await env.MEDIA.get(key);

      if (!object) {
        return new Response("Not Found", { status: 404 });
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("ETag", object.httpEtag);
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Cache-Control", "public, max-age=31536000, immutable");

      return new Response(
        request.method === "HEAD" ? null : object.body,
        { headers }
      );
    }

    // News-API
    if (
      normalizedPath === "/api/admin/news" ||
      normalizedPath.startsWith("/api/admin/news/")
    ) {
      try {
        const auth = createAuth(env);
        return await handleNewsApi(request, env, auth);
      } catch (error) {
        console.error("News API error:", error);
        return Response.json(
          { error: "Interner Fehler in der News-Verwaltung." },
          { status: 500 }
        );
      }
    }

    // CMS-API
    if (
      normalizedPath === "/api/admin" ||
      normalizedPath.startsWith("/api/admin/")
    ) {
      try {
        const auth = createAuth(env, request.cf);
        return await handleAdminApi(request, env, auth);
      } catch (error) {
        console.error("Admin API error:", error);
        return Response.json(
          { error: "Interner Serverfehler" },
          { status: 500 }
        );
      }
    }

    if (
      normalizedPath === "/api" ||
      normalizedPath.startsWith("/api/")
    ) {
      return Response.json(
        { error: "API-Endpunkt nicht implementiert" },
        { status: 404 }
      );
    }

    if (!env.ASSETS) {
      return new Response("Assets binding missing", { status: 500 });
    }

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);

    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("X-Frame-Options", "SAMEORIGIN");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};

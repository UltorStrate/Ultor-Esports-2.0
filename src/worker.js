import { createAuth } from "./auth.js";
import { handleAdminApi } from "./admin-api.js";

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

    // Interne Projektdateien nicht öffentlich ausliefern
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

    // Geschützte CMS-API
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

    // Andere API-Endpunkte sind noch nicht implementiert
    if (
      normalizedPath === "/api" ||
      normalizedPath.startsWith("/api/")
    ) {
      return Response.json(
        { error: "API-Endpunkt nicht implementiert" },
        { status: 404 }
      );
    }

    // Bestehende Website ausliefern
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


const BLOCKED_PREFIXES = [
  "/src",
  "/migrations",
  "/.git",
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

    // Interne Projektdateien niemals öffentlich ausliefern.
    const normalizedPath = pathname.toLowerCase();

    if (
      BLOCKED_PREFIXES.some(
        prefix =>
          normalizedPath === prefix ||
          normalizedPath.startsWith(prefix + "/")
      ) ||
      BLOCKED_FILES.includes(normalizedPath)
    ) {
      return new Response("Not Found", { status: 404 });
    }

    // API-Endpunkte werden später hier implementiert.
    if (
      normalizedPath === "/api" ||
      normalizedPath.startsWith("/api/")
    ) {
      return Response.json(
        { error: "API endpoint not implemented" },
        { status: 404 }
      );
    }

    // Bestehende Website über Cloudflare Assets ausliefern.
    if (!env.ASSETS) {
      return new Response("Assets binding missing", {
        status: 500
      });
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


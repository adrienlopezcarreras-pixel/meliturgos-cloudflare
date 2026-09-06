export function isApiRequest(request) {
  const url = new URL(request.url);
  return url.pathname.startsWith("/api/");
}

export function unauthorizedResponse(request) {
  const url = new URL(request.url);
  const isApi = url.pathname.startsWith("/api/");
  if (isApi) {
    return new Response(JSON.stringify({ error: "Authentification MELITURGOS requise", code: "AUTH_REQUIRED" }), {
      status: 401,
      headers: { "content-type": "application/json", "WWW-Authenticate": 'Basic realm="MELITURGOS"' },
    });
  }
  return new Response("Authentification MELITURGOS requise", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="MELITURGOS"' },
  });
}

export function notConfiguredResponse(request) {
  const url = new URL(request.url);
  const isApi = url.pathname.startsWith("/api/");
  if (isApi) {
    return new Response(
      JSON.stringify({ error: "MELITURGOS n'est pas configuré.", code: "AUTH_NOT_CONFIGURED" }),
      { status: 503, headers: { "content-type": "application/json" } }
    );
  }
  return new Response("<h1>MELITURGOS non configuré</h1>", { status: 503, headers: { "content-type": "text/html" } });
}

export function authorized(request, env) {
  const user = env.MELITURGOS_USER || "";
  const pass = env.MELITURGOS_PASSWORD || "";
  if (!user && !pass) return true;
  const header = request.headers.get("Authorization") || "";
  if (!header.toLowerCase().startsWith("basic ")) return false;
  const decoded = atob(header.slice(6));
  const [u, p] = decoded.split(":");
  return u === user && p === pass;
}

export function requireAuth(request, env) {
  if (!env.MELITURGOS_PASSWORD) return { ok: false, response: notConfiguredResponse(request) };
  if (!authorized(request, env)) return { ok: false, response: unauthorizedResponse(request) };
  return { ok: true };
}

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
      headers: {
        "content-type": "application/json",
        "WWW-Authenticate": 'Basic realm="MELITURGOS", charset="UTF-8"',
      },
    });
  }
  return new Response("Authentification MELITURGOS requise", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="MELITURGOS", charset="UTF-8"' },
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

function withoutTerminalNewline(value) {
  return String(value ?? "").replace(/[\r\n]+$/g, "");
}

function safeEqual(left, right) {
  const a = String(left ?? "");
  const b = String(right ?? "");
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function decodeBasicPayload(encoded) {
  const binary = atob(String(encoded || "").trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function basicCredentials(header) {
  if (!header.toLowerCase().startsWith("basic ")) return null;
  try {
    const decoded = decodeBasicPayload(header.slice(6));
    const split = decoded.indexOf(":");
    if (split < 0) return null;
    return {
      user: decoded.slice(0, split),
      pass: withoutTerminalNewline(decoded.slice(split + 1)),
    };
  } catch {
    return null;
  }
}

function bearerToken(header) {
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = withoutTerminalNewline(header.slice(7));
  return token || null;
}

/**
 * Operator authentication for MELITURGOS.
 *
 * Supported schemes:
 * - HTTP Basic (username + password), decoded as UTF-8 rather than treating
 *   atob()'s binary string as the final JavaScript text.
 * - Bearer <MELITURGOS_PASSWORD> as a robust operator fallback for CLI calls.
 *
 * Password material is never logged or returned. Only terminal CR/LF is
 * ignored so an interactive secret accidentally ending with a newline does
 * not lock the owner out; ordinary spaces remain significant.
 */
export function authorized(request, env) {
  const user = String(env.MELITURGOS_USER || "");
  const pass = withoutTerminalNewline(env.MELITURGOS_PASSWORD || "");
  if (!user && !pass) return true;
  if (!pass) return false;

  const header = request.headers.get("Authorization") || "";

  const basic = basicCredentials(header);
  if (basic) {
    return safeEqual(basic.user, user) && safeEqual(basic.pass, pass);
  }

  const bearer = bearerToken(header);
  if (bearer) return safeEqual(bearer, pass);

  return false;
}

export function requireAuth(request, env) {
  if (!env.MELITURGOS_PASSWORD) return { ok: false, response: notConfiguredResponse(request) };
  if (!authorized(request, env)) return { ok: false, response: unauthorizedResponse(request) };
  return { ok: true };
}


const SAFE_BROWSER_METHODS = new Set(['GET','HEAD','OPTIONS']);
const CROSS_SITE_PUBLIC_POST_PATHS = new Set([
  '/api/public/wordpress/chat',
  '/api/public/fides/chat',
  '/__preview/login',
]);

export function rejectCrossSiteMutation(request) {
  const method = String(request?.method || 'GET').toUpperCase();
  if (SAFE_BROWSER_METHODS.has(method)) return null;
  const url = new URL(request.url);
  if (CROSS_SITE_PUBLIC_POST_PATHS.has(url.pathname)) return null;

  const origin = String(request.headers.get('origin') || '').trim();
  if (origin && origin !== url.origin) {
    return new Response(JSON.stringify({ ok:false, error:'CROSS_SITE_MUTATION_FORBIDDEN', code:'CROSS_SITE_MUTATION_FORBIDDEN' }), {
      status: 403,
      headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' },
    });
  }

  const fetchSite = String(request.headers.get('sec-fetch-site') || '').toLowerCase();
  if (fetchSite === 'cross-site') {
    return new Response(JSON.stringify({ ok:false, error:'CROSS_SITE_MUTATION_FORBIDDEN', code:'CROSS_SITE_MUTATION_FORBIDDEN' }), {
      status: 403,
      headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' },
    });
  }
  return null;
}

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
        "cache-control": "no-store",
        "WWW-Authenticate": 'Basic realm="MELITURGOS", charset="UTF-8"',
      },
    });
  }
  return new Response("Authentification MELITURGOS requise", {
    status: 401,
    headers: { "cache-control": "no-store", "WWW-Authenticate": 'Basic realm="MELITURGOS", charset="UTF-8"' },
  });
}

export function notConfiguredResponse(request) {
  const url = new URL(request.url);
  const isApi = url.pathname.startsWith("/api/");
  if (isApi) {
    return new Response(
      JSON.stringify({ error: "MELITURGOS n'est pas configuré.", code: "AUTH_NOT_CONFIGURED" }),
      { status: 503, headers: { "content-type": "application/json", "cache-control": "no-store" } }
    );
  }
  return new Response("<h1>MELITURGOS non configuré</h1>", { status: 503, headers: { "content-type": "text/html", "cache-control": "no-store" } });
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

const RELEASE_SMOKE_ALLOWLIST = Object.freeze(new Map([
  ['POST', new Set([
    '/api/chat',
    '/api/gen2/capabilities/execute',
    '/api/gen2/migration/gen1-backfill',
    '/api/gen2/migration/chatgpt-memory-backfill',
    '/api/gen2/shardvault/search',
    '/api/gen2/web/research',
    '/api/gen2/connections/google/test',
    '/api/gen2/connections/microsoft/test',
    '/api/gen2/connections/yahoo/test',
    '/api/gen2/connections/yahoo-imap/test',
    '/api/gen2/connections/vercel/test',
    '/api/gen2/connections/pipedream/test',
    '/api/files/upload',
  ])],
  ['GET', new Set([
    '/api/v1/version',
    '/api/gen2/code/self-check',
    '/api/gen2/connections/google/status',
    '/api/gen2/connections/pipedream/accounts',
    '/api/gen2/capabilities',
    '/api/gen2/readiness',
    '/api/gen2/autonomy/sovereignty',
    '/api/learning/progress',
    '/api/gen2/migration/gen1-status',
    '/api/gen2/migration/chatgpt-memory-status',
    '/api/gen2/import/chatgpt-status',
    '/api/gen2/shardvault/status',
    '/api/gen2/import/chatgpt-status',
    '/api/memory/status',
    '/',
    '/professor',
    '/normal-runtime.js',
  ])],
]));

const PARALLEL_PROOF_ALLOWLIST = Object.freeze(new Map([
  ['POST', new Set([
    // Browser-rendered post-release proof needs the deterministic native-chat
    // smoke path. handleNativeChat keeps release-smoke requests constrained to
    // inferred code.read/code.search and ignores injected body capabilities.
    '/api/chat',
    '/api/gen2/capabilities/execute',
    // Read-only/diagnostic connector probes used by the exact-SHA
    // post-release proof. Configuration mutation routes such as /save are
    // intentionally excluded.
    '/api/gen2/connections/google/test',
    '/api/gen2/connections/microsoft/test',
    '/api/gen2/connections/yahoo/test',
    '/api/gen2/connections/yahoo-imap/test',
    '/api/gen2/connections/vercel/test',
    '/api/gen2/connections/pipedream/test',
    // Exact-SHA MEL-FILE proof uses this route only under additional
    // payload/name/size restrictions enforced inside handleFileUpload.
    '/api/files/upload',
  ])],
  ['GET', new Set([
    '/api/gen2/code/self-check',
    // Read-only CapabilityBus inventory/health refresh for exact-SHA
    // downstream diagnostics. It returns bounded capability metadata only.
    '/api/gen2/capabilities',
    '/api/gen2/connections/google/status',
    '/api/gen2/connections/pipedream/accounts',
    '/api/gen2/autonomy/sovereignty',
    '/api/learning/progress',
    '/',
    '/professor',
    '/normal-runtime.js',
  ])],
]));

export function isReleaseSmokeRequest(request, env) {
  const url = new URL(request.url);
  const method = String(request.method || 'GET').toUpperCase();
  const allowedPaths = RELEASE_SMOKE_ALLOWLIST.get(method);
  if (!allowedPaths?.has(url.pathname)) return false;
  if (request.headers.get('x-mel-release-smoke') !== '1') return false;
  const expected = withoutTerminalNewline(env?.MEL_LAUNCH_BOOTSTRAP_TOKEN || '');
  const supplied = withoutTerminalNewline(request.headers.get('x-mel-launch-bootstrap') || '');
  const primaryAuthorized = expected.length >= 32 && supplied.length === expected.length && safeEqual(supplied, expected);
  if (primaryAuthorized) return true;

  const parallelExpected = withoutTerminalNewline(env?.MEL_PARALLEL_PROOF_TOKEN || '');
  const parallelSupplied = withoutTerminalNewline(request.headers.get('x-mel-parallel-proof') || '');
  const parallelAuthorized = parallelExpected.length >= 32
    && parallelSupplied.length === parallelExpected.length
    && safeEqual(parallelSupplied, parallelExpected);
  if (!parallelAuthorized) return false;
  return PARALLEL_PROOF_ALLOWLIST.get(method)?.has(url.pathname) === true;
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
  if (isReleaseSmokeRequest(request, env)) return true;
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
  // Release proofs authenticate with their own narrow, allowlisted token.
  // Evaluate that path before the owner-password configuration check so a
  // missing operator secret cannot block exact-SHA release verification.
  if (isReleaseSmokeRequest(request, env)) return { ok: true };
  if (!env.MELITURGOS_PASSWORD) return { ok: false, response: notConfiguredResponse(request) };
  if (!authorized(request, env)) return { ok: false, response: unauthorizedResponse(request) };
  return { ok: true };
}

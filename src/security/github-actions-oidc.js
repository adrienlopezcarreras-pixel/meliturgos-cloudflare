const ISSUER = 'https://token.actions.githubusercontent.com';
const DISCOVERY_URL = ISSUER + '/.well-known/openid-configuration';
const DEFAULT_AUDIENCE = 'meliturgos-worker';
const CACHE_MS = 5 * 60 * 1000;

let oidcCache = null;
let oidcCacheExpiresAt = 0;

function error(code, status = 401) {
  const e = new Error(code);
  e.code = code;
  e.status = status;
  return e;
}

function decodeBase64Url(value) {
  const text = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = text + '='.repeat((4 - (text.length % 4 || 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}

function decodeJsonSegment(value, code) {
  try {
    const bytes = decodeBase64Url(value);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw error(code);
  }
}

function audienceMatches(actual, expected) {
  if (Array.isArray(actual)) return actual.map(String).includes(expected);
  return String(actual || '') === expected;
}

async function loadOidcMetadata(fetchImpl, now) {
  if (oidcCache && oidcCacheExpiresAt > now) return oidcCache;
  const discoveryResponse = await fetchImpl(DISCOVERY_URL, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!discoveryResponse.ok) throw error('GITHUB_OIDC_DISCOVERY_FAILED', 503);
  const discovery = await discoveryResponse.json();
  if (String(discovery?.issuer || '') !== ISSUER || !String(discovery?.jwks_uri || '').startsWith('https://')) {
    throw error('GITHUB_OIDC_DISCOVERY_INVALID', 503);
  }
  const jwksResponse = await fetchImpl(String(discovery.jwks_uri), {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!jwksResponse.ok) throw error('GITHUB_OIDC_JWKS_FAILED', 503);
  const jwks = await jwksResponse.json();
  if (!Array.isArray(jwks?.keys) || !jwks.keys.length) throw error('GITHUB_OIDC_JWKS_INVALID', 503);
  oidcCache = { discovery, jwks };
  oidcCacheExpiresAt = now + CACHE_MS;
  return oidcCache;
}

function expectedWorkflowRefs(repository, workflows) {
  return new Set((Array.isArray(workflows) ? workflows : [])
    .map(name => String(name || '').trim())
    .filter(Boolean)
    .map(name => `${repository}/.github/workflows/${name}@refs/heads/main`));
}

export async function verifyGitHubActionsOidcToken(token, {
  env = {},
  fetchImpl = fetch,
  now = Date.now(),
  audience = DEFAULT_AUDIENCE,
  allowedWorkflows = [],
  allowedEvents = [],
} = {}) {
  const raw = String(token || '').trim();
  const parts = raw.split('.');
  if (parts.length !== 3 || parts.some(part => !part)) throw error('GITHUB_OIDC_TOKEN_INVALID');

  const header = decodeJsonSegment(parts[0], 'GITHUB_OIDC_HEADER_INVALID');
  const claims = decodeJsonSegment(parts[1], 'GITHUB_OIDC_CLAIMS_INVALID');

  if (String(header?.alg || '') !== 'RS256' || !String(header?.kid || '')) {
    throw error('GITHUB_OIDC_HEADER_UNSUPPORTED');
  }

  const repository = String(env?.MEL_GITHUB_REPOSITORY || '').trim();
  if (!repository || String(claims?.repository || '') !== repository) {
    throw error('GITHUB_OIDC_REPOSITORY_DENIED', 403);
  }
  if (String(claims?.iss || '') !== ISSUER) throw error('GITHUB_OIDC_ISSUER_INVALID');
  if (!audienceMatches(claims?.aud, audience)) throw error('GITHUB_OIDC_AUDIENCE_INVALID');

  const nowSeconds = Math.floor(now / 1000);
  const exp = Number(claims?.exp || 0);
  const nbf = Number(claims?.nbf || 0);
  const iat = Number(claims?.iat || 0);
  if (!Number.isFinite(exp) || exp < nowSeconds - 30) throw error('GITHUB_OIDC_EXPIRED');
  if (Number.isFinite(nbf) && nbf > nowSeconds + 30) throw error('GITHUB_OIDC_NOT_YET_VALID');
  if (Number.isFinite(iat) && iat > nowSeconds + 30) throw error('GITHUB_OIDC_IAT_INVALID');

  const allowedRefs = expectedWorkflowRefs(repository, allowedWorkflows);
  if (allowedRefs.size && !allowedRefs.has(String(claims?.workflow_ref || ''))) {
    throw error('GITHUB_OIDC_WORKFLOW_DENIED', 403);
  }
  const events = new Set((Array.isArray(allowedEvents) ? allowedEvents : []).map(String));
  if (events.size && !events.has(String(claims?.event_name || ''))) {
    throw error('GITHUB_OIDC_EVENT_DENIED', 403);
  }

  const { jwks } = await loadOidcMetadata(fetchImpl, now);
  const jwk = jwks.keys.find(key => String(key?.kid || '') === String(header.kid));
  if (!jwk) {
    oidcCache = null;
    oidcCacheExpiresAt = 0;
    throw error('GITHUB_OIDC_KID_UNKNOWN', 401);
  }

  let key;
  try {
    key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
  } catch {
    throw error('GITHUB_OIDC_KEY_IMPORT_FAILED', 503);
  }

  const signingInput = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  const signature = decodeBase64Url(parts[2]);
  const verified = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    signature,
    signingInput,
  );
  if (!verified) throw error('GITHUB_OIDC_SIGNATURE_INVALID');

  return {
    ok: true,
    repository,
    workflow_ref: String(claims.workflow_ref || ''),
    event_name: String(claims.event_name || ''),
    actor: String(claims.actor || ''),
    run_id: Number(claims.run_id || 0) || null,
    run_number: Number(claims.run_number || 0) || null,
    ref: String(claims.ref || ''),
    sha: String(claims.sha || ''),
    subject: String(claims.sub || ''),
  };
}

export async function authorizeGitHubActionsOidcRequest(request, env, options = {}) {
  const token = String(request?.headers?.get('x-mel-github-oidc') || '').trim();
  if (!token) return { ok: false, code: 'GITHUB_OIDC_TOKEN_REQUIRED', status: 401 };
  try {
    const identity = await verifyGitHubActionsOidcToken(token, { env, ...options });
    return { ok: true, identity };
  } catch (err) {
    return {
      ok: false,
      code: String(err?.code || err?.message || 'GITHUB_OIDC_AUTH_FAILED'),
      status: Number(err?.status || 401),
    };
  }
}

export const GITHUB_ACTIONS_OIDC_ISSUER = ISSUER;
export const GITHUB_ACTIONS_OIDC_AUDIENCE = DEFAULT_AUDIENCE;

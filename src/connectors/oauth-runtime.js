import { DomainError, requireValue } from '../core/contracts.js';
import { connectorDefinitions } from './registry.js';
import { oauthProfileForConnector } from './oauth-profiles.js';

const DEFAULT_STATE_TTL_MS = 10 * 60 * 1000;
const MAX_STATE_TTL_MS = 30 * 60 * 1000;

const definitionById = new Map(connectorDefinitions.map(definition => [definition.id, definition]));
const clone = value => value == null ? value : structuredClone(value);

function textValue(value, code, max = 2000) {
  const valueText = String(value ?? '').trim();
  requireValue(valueText.length > 0 && valueText.length <= max, code, 400);
  return valueText;
}

function ownerFrom(context = {}) {
  return textValue(context.owner, 'OAUTH_OWNER_REQUIRED', 200);
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return base64Url(value);
}

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

function timeoutSignal(ms = 10000) {
  return typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(ms) : undefined;
}

function stateTtl(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_STATE_TTL_MS;
  return Math.min(MAX_STATE_TTL_MS, Math.max(60_000, Math.trunc(parsed)));
}

function safeRedirectUri(value) {
  const uri = textValue(value, 'OAUTH_REDIRECT_URI_REQUIRED', 2048);
  let parsed;
  try { parsed = new URL(uri); } catch { throw new DomainError('OAUTH_REDIRECT_URI_INVALID', 500); }
  const localhost = parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  requireValue(parsed.protocol === 'https:' || localhost, 'OAUTH_REDIRECT_URI_INSECURE', 500);
  requireValue(!parsed.username && !parsed.password && !parsed.hash, 'OAUTH_REDIRECT_URI_INVALID', 500);
  return parsed.toString();
}

function runtimeConfig(profile, env = {}) {
  const clientId = textValue(env[profile.client_id_env], 'OAUTH_CLIENT_ID_REQUIRED', 500);
  const redirectUri = safeRedirectUri(env[profile.redirect_uri_env]);
  const clientSecret = typeof env[profile.client_secret_env] === 'string' && env[profile.client_secret_env].trim()
    ? env[profile.client_secret_env].trim()
    : null;
  return { clientId, clientSecret, redirectUri };
}

function profileFor(id) {
  const connectorId = textValue(id, 'OAUTH_CONNECTOR_ID_REQUIRED', 120);
  const profile = oauthProfileForConnector(connectorId);
  requireValue(profile, 'OAUTH_CONNECTOR_NOT_SUPPORTED', 404);
  const definition = definitionById.get(connectorId);
  requireValue(definition?.auth_type === 'OAUTH2', 'OAUTH_CONNECTOR_NOT_SUPPORTED', 404);
  return { connectorId, profile, definition };
}

function normalizedScopes(profile, requested) {
  const required = [...profile.required_scopes];
  const optional = [...profile.optional_scopes];
  const allowed = new Set([...required, ...optional]);
  const scopes = requested == null
    ? required
    : [...new Set((Array.isArray(requested) ? requested : [requested]).map(scope => textValue(scope, 'OAUTH_SCOPE_INVALID', 500)))];
  requireValue(scopes.every(scope => allowed.has(scope)), 'OAUTH_SCOPE_UNDECLARED', 400);
  requireValue(required.every(scope => scopes.includes(scope)), 'OAUTH_REQUIRED_SCOPE_MISSING', 400);
  return scopes.sort();
}

function grantedScopes(profile, responseScope, fallbackScopes) {
  const response = typeof responseScope === 'string' && responseScope.trim()
    ? [...new Set(responseScope.split(/\s+/).map(value => value.trim()).filter(Boolean))]
    : [...fallbackScopes];
  const allowed = new Set([...profile.required_scopes, ...profile.optional_scopes]);
  requireValue(response.every(scope => allowed.has(scope)), 'OAUTH_GRANTED_SCOPE_UNDECLARED', 502);
  requireValue(profile.required_scopes.every(scope => response.includes(scope)), 'OAUTH_GRANTED_SCOPE_MISSING', 502);
  return response.sort();
}

async function responsePayload(response) {
  try {
    const payload = await response.json();
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  } catch {
    return {};
  }
}

function publicCredentials(record, now) {
  if (!record) {
    return Object.freeze({
      configured: false,
      status: 'AUTH_REQUIRED',
      scopes: Object.freeze([]),
      expires_at: null,
      expired: true,
      refreshable: false,
    });
  }
  const expiresAt = Number(record.expires_at || 0) || null;
  const expired = expiresAt != null ? expiresAt <= Number(now) : false;
  return Object.freeze({
    configured: true,
    status: expired ? 'DEGRADED' : 'CONNECTED',
    scopes: Object.freeze([...(record.scopes || [])]),
    expires_at: expiresAt,
    expired,
    refreshable: typeof record.refresh_token === 'string' && record.refresh_token.length > 0,
  });
}

function requireStateStore(store) {
  requireValue(
    store
      && typeof store.putSession === 'function'
      && typeof store.consumeSession === 'function',
    'OAUTH_STATE_STORE_REQUIRED',
    500,
  );
  return store;
}

function requireCredentialStore(store) {
  requireValue(
    store
      && typeof store.putCredentials === 'function'
      && typeof store.getCredentials === 'function'
      && typeof store.deleteCredentials === 'function',
    'OAUTH_CREDENTIAL_STORE_REQUIRED',
    500,
  );
  return store;
}

export function createMemoryOAuthStateStore() {
  const sessions = new Map();
  return Object.freeze({
    async putSession(state, record) {
      requireValue(!sessions.has(state), 'OAUTH_STATE_COLLISION', 409);
      sessions.set(state, clone(record));
      return true;
    },
    async consumeSession(state) {
      const value = sessions.get(state) || null;
      if (!value) return null;
      sessions.delete(state);
      return clone(value);
    },
  });
}

export function createMemoryOAuthCredentialStore() {
  const credentials = new Map();
  const key = ({ connector_id, owner }) => `${owner}::${connector_id}`;
  return Object.freeze({
    async putCredentials(identity, record) {
      credentials.set(key(identity), clone(record));
      return true;
    },
    async getCredentials(identity) {
      const value = credentials.get(key(identity));
      return value ? clone(value) : null;
    },
    async deleteCredentials(identity) {
      return credentials.delete(key(identity));
    },
  });
}

export function createOAuth2ConnectorAdapter({
  env = {},
  stateStore,
  credentialStore,
  fetcher = fetch,
  now = () => Date.now(),
  stateTtlMs = DEFAULT_STATE_TTL_MS,
} = {}) {
  const states = requireStateStore(stateStore);
  const credentials = requireCredentialStore(credentialStore);
  requireValue(typeof fetcher === 'function', 'OAUTH_FETCHER_REQUIRED', 500);

  async function begin(input = {}, context = {}) {
    const owner = ownerFrom(context);
    const { connectorId, profile } = profileFor(input.connector_id ?? input.id);
    const config = runtimeConfig(profile, env);
    const scopes = normalizedScopes(profile, input.scopes);
    const state = randomToken(32);
    const verifier = randomToken(48);
    const challenge = await sha256Base64Url(verifier);
    const createdAt = Number(now());
    const expiresAt = createdAt + stateTtl(stateTtlMs);

    await states.putSession(state, {
      connector_id: connectorId,
      owner,
      code_verifier: verifier,
      scopes,
      redirect_uri: config.redirectUri,
      created_at: createdAt,
      expires_at: expiresAt,
    });

    const url = new URL(profile.authorization_endpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('scope', scopes.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    for (const [key, value] of Object.entries(profile.authorize_params || {})) {
      url.searchParams.set(key, value);
    }

    return Object.freeze({
      connector_id: connectorId,
      provider: profile.provider,
      authorization_url: url.toString(),
      state,
      scopes: Object.freeze(scopes),
      expires_at: expiresAt,
      pkce: 'S256',
    });
  }

  async function callback(input = {}, context = {}) {
    const state = textValue(input.state, 'OAUTH_STATE_REQUIRED', 500);
    const code = textValue(input.code, 'OAUTH_CODE_REQUIRED', 8000);
    const session = await states.consumeSession(state);
    requireValue(session, 'OAUTH_STATE_INVALID_OR_REPLAYED', 409);
    requireValue(Number(session.expires_at || 0) > Number(now()), 'OAUTH_STATE_EXPIRED', 409);

    const owner = ownerFrom(context);
    requireValue(session.owner === owner, 'OAUTH_OWNER_MISMATCH', 403);
    const { connectorId, profile } = profileFor(session.connector_id);
    const config = runtimeConfig(profile, env);
    requireValue(config.redirectUri === session.redirect_uri, 'OAUTH_REDIRECT_URI_MISMATCH', 409);

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      code_verifier: session.code_verifier,
    });
    if (config.clientSecret) body.set('client_secret', config.clientSecret);

    let response;
    try {
      response = await fetcher(profile.token_endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        redirect: 'error',
        signal: timeoutSignal(10000),
      });
    } catch {
      throw new DomainError('OAUTH_TOKEN_ENDPOINT_UNREACHABLE', 503);
    }
    const payload = await responsePayload(response);
    requireValue(response.ok, 'OAUTH_TOKEN_EXCHANGE_FAILED', 502);
    const accessToken = textValue(payload.access_token, 'OAUTH_ACCESS_TOKEN_MISSING', 20000);
    const scopes = grantedScopes(profile, payload.scope, session.scopes);
    const obtainedAt = Number(now());
    const expiresIn = Number(payload.expires_in);
    const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
      ? obtainedAt + Math.trunc(expiresIn * 1000)
      : null;

    const credential = {
      connector_id: connectorId,
      owner,
      access_token: accessToken,
      refresh_token: typeof payload.refresh_token === 'string' && payload.refresh_token.trim()
        ? payload.refresh_token.trim()
        : null,
      token_type: typeof payload.token_type === 'string' && payload.token_type.trim()
        ? payload.token_type.trim()
        : 'Bearer',
      scopes,
      obtained_at: obtainedAt,
      expires_at: expiresAt,
    };
    await credentials.putCredentials({ connector_id: connectorId, owner }, credential);

    return Object.freeze({
      connector_id: connectorId,
      provider: profile.provider,
      status: 'CONNECTED',
      scopes: Object.freeze(scopes),
      expires_at: expiresAt,
      refreshable: Boolean(credential.refresh_token),
    });
  }

  async function refresh(input = {}, context = {}) {
    const owner = ownerFrom(context);
    const { connectorId, profile } = profileFor(input.connector_id ?? input.id);
    const config = runtimeConfig(profile, env);
    const current = await credentials.getCredentials({ connector_id: connectorId, owner });
    requireValue(current, 'OAUTH_CREDENTIALS_NOT_FOUND', 404);
    const refreshToken = textValue(current.refresh_token, 'OAUTH_REFRESH_TOKEN_REQUIRED', 20000);

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.clientId,
    });
    if (config.clientSecret) body.set('client_secret', config.clientSecret);

    let response;
    try {
      response = await fetcher(profile.token_endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        redirect: 'error',
        signal: timeoutSignal(10000),
      });
    } catch {
      throw new DomainError('OAUTH_TOKEN_ENDPOINT_UNREACHABLE', 503);
    }
    const payload = await responsePayload(response);
    requireValue(response.ok, 'OAUTH_REFRESH_FAILED', 502);
    const accessToken = textValue(payload.access_token, 'OAUTH_ACCESS_TOKEN_MISSING', 20000);
    const scopes = grantedScopes(profile, payload.scope, current.scopes || profile.required_scopes);
    const obtainedAt = Number(now());
    const expiresIn = Number(payload.expires_in);
    const next = {
      ...current,
      access_token: accessToken,
      refresh_token: typeof payload.refresh_token === 'string' && payload.refresh_token.trim()
        ? payload.refresh_token.trim()
        : refreshToken,
      token_type: typeof payload.token_type === 'string' && payload.token_type.trim()
        ? payload.token_type.trim()
        : current.token_type || 'Bearer',
      scopes,
      obtained_at: obtainedAt,
      expires_at: Number.isFinite(expiresIn) && expiresIn > 0
        ? obtainedAt + Math.trunc(expiresIn * 1000)
        : current.expires_at ?? null,
    };
    await credentials.putCredentials({ connector_id: connectorId, owner }, next);

    return Object.freeze({
      connector_id: connectorId,
      provider: profile.provider,
      status: 'CONNECTED',
      scopes: Object.freeze(scopes),
      expires_at: next.expires_at ?? null,
      refreshable: true,
    });
  }

  async function revoke(input = {}, context = {}) {
    const owner = ownerFrom(context);
    const { connectorId, profile } = profileFor(input.connector_id ?? input.id);
    const current = await credentials.getCredentials({ connector_id: connectorId, owner });
    if (!current) {
      return Object.freeze({ connector_id: connectorId, status: 'AUTH_REQUIRED', local_deleted: false, remote_revoked: false });
    }

    let remoteRevoked = false;
    if (profile.revoke_endpoint) {
      const token = current.refresh_token || current.access_token;
      try {
        const response = await fetcher(profile.revoke_endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token }).toString(),
          redirect: 'error',
          signal: timeoutSignal(10000),
        });
        remoteRevoked = response.ok;
        await response.body?.cancel?.();
      } catch {
        remoteRevoked = false;
      }
    }

    const localDeleted = await credentials.deleteCredentials({ connector_id: connectorId, owner });
    return Object.freeze({
      connector_id: connectorId,
      status: 'AUTH_REQUIRED',
      local_deleted: Boolean(localDeleted),
      remote_revoked: remoteRevoked,
    });
  }

  async function status(input = {}, context = {}) {
    const owner = ownerFrom(context);
    const { connectorId, profile } = profileFor(input.connector_id ?? input.id);
    const current = await credentials.getCredentials({ connector_id: connectorId, owner });
    return Object.freeze({
      connector_id: connectorId,
      provider: profile.provider,
      ...publicCredentials(current, now()),
    });
  }

  async function health(input = {}, context = {}) {
    const owner = ownerFrom(context);
    const { connectorId, profile, definition } = profileFor(input.connector_id ?? input.id);
    const current = await credentials.getCredentials({ connector_id: connectorId, owner });
    const publicState = publicCredentials(current, now());
    if (!current) {
      return Object.freeze({ connector_id: connectorId, provider: profile.provider, status: 'AUTH_REQUIRED', auth_valid: false, reachable: 'NOT_TESTED', scopes: Object.freeze([]) });
    }
    if (publicState.expired) {
      return Object.freeze({
        connector_id: connectorId,
        provider: profile.provider,
        status: 'DEGRADED',
        auth_valid: false,
        reachable: 'NOT_TESTED',
        code: 'ACCESS_TOKEN_EXPIRED',
        scopes: publicState.scopes,
        refreshable: publicState.refreshable,
      });
    }

    let response;
    try {
      response = await fetcher(definition.probe, {
        method: 'GET',
        headers: { authorization: `Bearer ${current.access_token}` },
        redirect: 'error',
        signal: timeoutSignal(8000),
      });
    } catch {
      return Object.freeze({
        connector_id: connectorId,
        provider: profile.provider,
        status: 'ERROR',
        auth_valid: null,
        reachable: false,
        code: 'CONNECTOR_PROBE_UNREACHABLE',
        scopes: publicState.scopes,
      });
    }

    const statusCode = Number(response.status);
    await response.body?.cancel?.();
    const authValid = response.ok ? true : [401, 403].includes(statusCode) ? false : null;
    const statusValue = response.ok
      ? 'CONNECTED'
      : [401, 403].includes(statusCode)
        ? 'AUTH_REQUIRED'
        : statusCode === 429
          ? 'DEGRADED'
          : 'ERROR';
    return Object.freeze({
      connector_id: connectorId,
      provider: profile.provider,
      status: statusValue,
      auth_valid: authValid,
      reachable: statusCode < 500,
      http_status: statusCode,
      scopes: publicState.scopes,
    });
  }

  return Object.freeze({ begin, callback, refresh, revoke, status, health });
}

import { DomainError, requireValue } from '../core/contracts.js';

const DEFAULT_TRANSACTION_TTL_MS = 10 * 60 * 1000;
const MAX_TRANSACTION_TTL_MS = 30 * 60 * 1000;
const MIN_TRANSACTION_TTL_MS = 60 * 1000;

function oauthError(code, status = 400) {
  return new DomainError(code, status);
}

function text(value) {
  return String(value ?? '').trim();
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function uniqueStrings(values, code, { max = 128 } = {}) {
  requireValue(Array.isArray(values) && values.length <= max, code, 400);
  const normalized = values.map(value => {
    const item = text(value);
    requireValue(item && item.length <= 500, code, 400);
    return item;
  });
  requireValue(new Set(normalized).size === normalized.length, code + '_DUPLICATE', 400);
  return normalized.sort((a, b) => a.localeCompare(b));
}

function safeUrl(value, code) {
  let url;
  try {
    url = new URL(text(value));
  } catch {
    throw oauthError(code);
  }
  const localHttp = url.protocol === 'http:'
    && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1');
  requireValue(url.protocol === 'https:' || localHttp, code, 400);
  requireValue(!url.username && !url.password, code, 400);
  return url;
}

function providerConfig(value) {
  requireValue(isObject(value), 'OAUTH_PROVIDER_CONFIG_REQUIRED', 500);
  const connectorId = text(value.connector_id);
  const clientId = text(value.client_id);
  const authorizationEndpoint = safeUrl(value.authorization_endpoint, 'OAUTH_AUTHORIZATION_ENDPOINT_INVALID');
  const redirectUri = safeUrl(value.redirect_uri, 'OAUTH_REDIRECT_URI_INVALID');
  const tokenEndpoint = value.token_endpoint
    ? safeUrl(value.token_endpoint, 'OAUTH_TOKEN_ENDPOINT_INVALID').toString()
    : null;
  const revocationEndpoint = value.revocation_endpoint
    ? safeUrl(value.revocation_endpoint, 'OAUTH_REVOCATION_ENDPOINT_INVALID').toString()
    : null;
  requireValue(connectorId, 'OAUTH_PROVIDER_CONNECTOR_ID_REQUIRED', 500);
  requireValue(clientId && clientId.length <= 1000, 'OAUTH_CLIENT_ID_REQUIRED', 500);
  requireValue(value.auth === undefined || value.auth === 'oauth2', 'OAUTH_PROVIDER_AUTH_MODE_INVALID', 500);
  return Object.freeze({
    connector_id: connectorId,
    client_id: clientId,
    authorization_endpoint: authorizationEndpoint.toString(),
    token_endpoint: tokenEndpoint,
    revocation_endpoint: revocationEndpoint,
    redirect_uri: redirectUri.toString(),
    extra_authorization_params: isObject(value.extra_authorization_params)
      ? structuredClone(value.extra_authorization_params)
      : {},
  });
}

function manifestConfig(value, connectorId) {
  requireValue(isObject(value), 'OAUTH_CONNECTOR_MANIFEST_REQUIRED', 500);
  requireValue(text(value.id) === connectorId, 'OAUTH_CONNECTOR_MANIFEST_ID_MISMATCH', 500);
  requireValue(text(value.auth).toLowerCase() === 'oauth2', 'OAUTH_CONNECTOR_NOT_OAUTH2', 409);
  const requiredScopes = uniqueStrings(value.scopes?.required || [], 'OAUTH_SCOPE_INVALID');
  const optionalScopes = uniqueStrings(value.scopes?.optional || [], 'OAUTH_SCOPE_INVALID')
    .filter(scope => !requiredScopes.includes(scope));
  return Object.freeze({
    id: connectorId,
    version: text(value.version),
    required_scopes: requiredScopes,
    optional_scopes: optionalScopes,
  });
}

function requestedScopes(manifest, optionalRequested = []) {
  const requestedOptional = uniqueStrings(optionalRequested, 'OAUTH_SCOPE_INVALID');
  const optional = new Set(manifest.optional_scopes);
  const undeclared = requestedOptional.filter(scope => !optional.has(scope));
  requireValue(undeclared.length === 0, 'OAUTH_SCOPE_UNDECLARED', 403);
  return [...new Set([...manifest.required_scopes, ...requestedOptional])].sort((a, b) => a.localeCompare(b));
}

function grantedScopesFromToken(tokenSet, transaction) {
  let scopes;
  if (Array.isArray(tokenSet?.scopes)) {
    scopes = uniqueStrings(tokenSet.scopes, 'OAUTH_TOKEN_SCOPE_INVALID');
  } else if (typeof tokenSet?.scope === 'string' && tokenSet.scope.trim()) {
    scopes = uniqueStrings(tokenSet.scope.trim().split(/\s+/), 'OAUTH_TOKEN_SCOPE_INVALID');
  } else {
    scopes = [...transaction.requested_scopes];
  }

  const declared = new Set([
    ...transaction.required_scopes,
    ...transaction.optional_scopes,
  ]);
  requireValue(scopes.every(scope => declared.has(scope)), 'OAUTH_RETURNED_SCOPE_UNDECLARED', 409);
  requireValue(
    transaction.required_scopes.every(scope => scopes.includes(scope)),
    'OAUTH_REQUIRED_SCOPE_NOT_GRANTED',
    409,
  );
  return scopes;
}

function normalizeTokenSet(value, transaction, now) {
  requireValue(isObject(value), 'OAUTH_TOKEN_SET_REQUIRED', 502);
  const accessToken = text(value.access_token);
  requireValue(accessToken, 'OAUTH_ACCESS_TOKEN_REQUIRED', 502);
  const tokenType = text(value.token_type || 'Bearer');
  const refreshToken = text(value.refresh_token);
  const expiresIn = Number(value.expires_in);
  const expiresAtInput = Number(value.expires_at);
  const expiresAt = Number.isFinite(expiresAtInput)
    ? expiresAtInput
    : Number.isFinite(expiresIn) && expiresIn > 0
      ? now + Math.trunc(expiresIn * 1000)
      : null;
  const scopes = grantedScopesFromToken(value, transaction);

  return Object.freeze({
    access_token: accessToken,
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
    token_type: tokenType,
    scopes,
    expires_at: expiresAt,
    provider_metadata: isObject(value.provider_metadata)
      ? structuredClone(value.provider_metadata)
      : {},
  });
}

function publicTokenStatus(tokenSet, connectorId) {
  return Object.freeze({
    connector_id: connectorId,
    authorized: Boolean(tokenSet?.access_token),
    token_type: text(tokenSet?.token_type || 'Bearer'),
    scopes: Array.isArray(tokenSet?.scopes) ? [...tokenSet.scopes] : [],
    expires_at: Number.isFinite(tokenSet?.expires_at) ? Number(tokenSet.expires_at) : null,
    refreshable: Boolean(tokenSet?.refresh_token),
  });
}

function randomBase64Url(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '');
}

async function pkceChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '');
}

function transactionTtl(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_TRANSACTION_TTL_MS;
  return Math.max(MIN_TRANSACTION_TTL_MS, Math.min(MAX_TRANSACTION_TTL_MS, Math.trunc(number)));
}

function requireRuntimeDependencies({
  resolveProvider,
  resolveManifest,
  transactionVault,
  tokenVault,
  tokenClient,
}) {
  if (typeof resolveProvider !== 'function') throw new Error('OAUTH_PROVIDER_RESOLVER_REQUIRED');
  if (typeof resolveManifest !== 'function') throw new Error('OAUTH_MANIFEST_RESOLVER_REQUIRED');
  if (!transactionVault || typeof transactionVault.put !== 'function' || typeof transactionVault.take !== 'function') {
    throw new Error('OAUTH_TRANSACTION_VAULT_REQUIRED');
  }
  if (!tokenVault
    || typeof tokenVault.put !== 'function'
    || typeof tokenVault.get !== 'function'
    || typeof tokenVault.delete !== 'function') {
    throw new Error('OAUTH_TOKEN_VAULT_REQUIRED');
  }
  if (!tokenClient
    || typeof tokenClient.exchange !== 'function'
    || typeof tokenClient.refresh !== 'function'
    || typeof tokenClient.revoke !== 'function') {
    throw new Error('OAUTH_TOKEN_CLIENT_REQUIRED');
  }
}

function ownerFrom(context = {}) {
  const owner = text(context.owner);
  requireValue(owner, 'OAUTH_OWNER_REQUIRED', 401);
  return owner;
}

/**
 * Generic OAuth2 Authorization Code + PKCE runtime.
 *
 * Security boundaries:
 * - provider endpoints/client id come only from trusted resolveProvider()
 * - connector scopes come only from trusted resolveManifest()
 * - state + PKCE verifier live only in transactionVault
 * - access/refresh tokens live only in tokenVault
 * - public results never contain access_token, refresh_token or verifier
 */
export class OAuth2PkceRuntime {
  constructor({
    resolveProvider,
    resolveManifest,
    transactionVault,
    tokenVault,
    tokenClient,
    onAuthorized = null,
    onRevoked = null,
    now = () => Date.now(),
    transactionTtlMs = DEFAULT_TRANSACTION_TTL_MS,
  } = {}) {
    requireRuntimeDependencies({
      resolveProvider,
      resolveManifest,
      transactionVault,
      tokenVault,
      tokenClient,
    });
    if (onAuthorized != null && typeof onAuthorized !== 'function') throw new Error('OAUTH_AUTHORIZED_HOOK_INVALID');
    if (onRevoked != null && typeof onRevoked !== 'function') throw new Error('OAUTH_REVOKED_HOOK_INVALID');

    this.resolveProvider = resolveProvider;
    this.resolveManifest = resolveManifest;
    this.transactionVault = transactionVault;
    this.tokenVault = tokenVault;
    this.tokenClient = tokenClient;
    this.onAuthorized = onAuthorized;
    this.onRevoked = onRevoked;
    this.now = now;
    this.transactionTtlMs = transactionTtl(transactionTtlMs);
  }

  async begin(input = {}, context = {}) {
    const owner = ownerFrom(context);
    const connectorId = text(input.connector_id);
    requireValue(connectorId, 'OAUTH_CONNECTOR_ID_REQUIRED', 400);

    const provider = providerConfig(await this.resolveProvider(connectorId, context));
    requireValue(provider.connector_id === connectorId, 'OAUTH_PROVIDER_CONNECTOR_ID_MISMATCH', 500);
    const manifest = manifestConfig(await this.resolveManifest(connectorId, context), connectorId);
    const scopes = requestedScopes(manifest, input.optional_scopes || []);

    const state = randomBase64Url(32);
    const verifier = randomBase64Url(64);
    const challenge = await pkceChallenge(verifier);
    const createdAt = this.now();
    const expiresAt = createdAt + this.transactionTtlMs;

    await this.transactionVault.put({
      owner,
      connector_id: connectorId,
      state,
      record: Object.freeze({
        owner,
        connector_id: connectorId,
        connector_version: manifest.version,
        state,
        code_verifier: verifier,
        required_scopes: [...manifest.required_scopes],
        optional_scopes: [...manifest.optional_scopes],
        requested_scopes: scopes,
        redirect_uri: provider.redirect_uri,
        created_at: createdAt,
        expires_at: expiresAt,
      }),
    });

    const authorization = new URL(provider.authorization_endpoint);
    authorization.searchParams.set('response_type', 'code');
    authorization.searchParams.set('client_id', provider.client_id);
    authorization.searchParams.set('redirect_uri', provider.redirect_uri);
    authorization.searchParams.set('scope', scopes.join(' '));
    authorization.searchParams.set('state', state);
    authorization.searchParams.set('code_challenge', challenge);
    authorization.searchParams.set('code_challenge_method', 'S256');

    for (const [key, value] of Object.entries(provider.extra_authorization_params)) {
      const normalizedKey = text(key);
      const normalizedValue = text(value);
      if (!normalizedKey || !normalizedValue) continue;
      requireValue(
        !['response_type','client_id','redirect_uri','scope','state','code_challenge','code_challenge_method'].includes(normalizedKey),
        'OAUTH_RESERVED_AUTHORIZATION_PARAM',
        500,
      );
      authorization.searchParams.set(normalizedKey, normalizedValue);
    }

    return Object.freeze({
      connector_id: connectorId,
      authorization_url: authorization.toString(),
      expires_at: expiresAt,
      scopes,
      pkce_method: 'S256',
    });
  }

  async callback(input = {}, context = {}) {
    const owner = ownerFrom(context);
    const connectorId = text(input.connector_id);
    const state = text(input.state);
    const code = text(input.code);
    requireValue(connectorId, 'OAUTH_CONNECTOR_ID_REQUIRED', 400);
    requireValue(state, 'OAUTH_STATE_REQUIRED', 400);
    requireValue(code, 'OAUTH_CODE_REQUIRED', 400);

    const transaction = await this.transactionVault.take({
      owner,
      connector_id: connectorId,
      state,
    });
    requireValue(transaction, 'OAUTH_STATE_INVALID_OR_REPLAYED', 409);
    requireValue(transaction.owner === owner, 'OAUTH_TRANSACTION_OWNER_MISMATCH', 409);
    requireValue(transaction.connector_id === connectorId, 'OAUTH_TRANSACTION_CONNECTOR_MISMATCH', 409);
    requireValue(Number(transaction.expires_at) >= this.now(), 'OAUTH_TRANSACTION_EXPIRED', 409);

    const provider = providerConfig(await this.resolveProvider(connectorId, context));
    requireValue(provider.redirect_uri === transaction.redirect_uri, 'OAUTH_REDIRECT_URI_CHANGED', 409);

    const exchanged = await this.tokenClient.exchange({
      owner,
      connector_id: connectorId,
      code,
      code_verifier: transaction.code_verifier,
      redirect_uri: transaction.redirect_uri,
      provider,
    }, context);

    const tokenSet = normalizeTokenSet(exchanged, transaction, this.now());
    await this.tokenVault.put({
      owner,
      connector_id: connectorId,
      token_set: tokenSet,
    });

    const status = publicTokenStatus(tokenSet, connectorId);
    if (this.onAuthorized) {
      try {
        await this.onAuthorized({
          owner,
          connector_id: connectorId,
          connector_version: transaction.connector_version,
          granted_scopes: [...tokenSet.scopes],
          status,
        }, context);
      } catch (error) {
        await this.tokenVault.delete({ owner, connector_id: connectorId });
        throw error;
      }
    }
    return status;
  }

  async refresh(input = {}, context = {}) {
    const owner = ownerFrom(context);
    const connectorId = text(input.connector_id);
    requireValue(connectorId, 'OAUTH_CONNECTOR_ID_REQUIRED', 400);

    const current = await this.tokenVault.get({ owner, connector_id: connectorId });
    requireValue(current?.access_token, 'OAUTH_TOKEN_NOT_FOUND', 404);
    requireValue(current?.refresh_token, 'OAUTH_REFRESH_TOKEN_NOT_AVAILABLE', 409);

    const provider = providerConfig(await this.resolveProvider(connectorId, context));
    const manifest = manifestConfig(await this.resolveManifest(connectorId, context), connectorId);
    const transaction = {
      required_scopes: manifest.required_scopes,
      optional_scopes: manifest.optional_scopes,
      requested_scopes: Array.isArray(current.scopes) ? current.scopes : manifest.required_scopes,
    };

    const refreshed = await this.tokenClient.refresh({
      owner,
      connector_id: connectorId,
      refresh_token: current.refresh_token,
      provider,
    }, context);

    const normalized = normalizeTokenSet({
      ...refreshed,
      refresh_token: text(refreshed?.refresh_token) || current.refresh_token,
      scope: refreshed?.scope,
      scopes: refreshed?.scopes || current.scopes,
    }, transaction, this.now());

    await this.tokenVault.put({
      owner,
      connector_id: connectorId,
      token_set: normalized,
    });
    return publicTokenStatus(normalized, connectorId);
  }

  async revoke(input = {}, context = {}) {
    const owner = ownerFrom(context);
    const connectorId = text(input.connector_id);
    requireValue(connectorId, 'OAUTH_CONNECTOR_ID_REQUIRED', 400);

    const current = await this.tokenVault.get({ owner, connector_id: connectorId });
    if (!current) {
      return Object.freeze({
        connector_id: connectorId,
        revoked: true,
        already_absent: true,
      });
    }

    const provider = providerConfig(await this.resolveProvider(connectorId, context));
    const result = await this.tokenClient.revoke({
      owner,
      connector_id: connectorId,
      access_token: current.access_token,
      refresh_token: current.refresh_token || null,
      provider,
    }, context);
    requireValue(result?.ok === true, 'OAUTH_REVOKE_NOT_CONFIRMED', 502);

    await this.tokenVault.delete({ owner, connector_id: connectorId });
    if (this.onRevoked) {
      await this.onRevoked({ owner, connector_id: connectorId }, context);
    }
    return Object.freeze({
      connector_id: connectorId,
      revoked: true,
      already_absent: false,
    });
  }
}

export function createOAuth2PkceAdapters(options = {}) {
  const runtime = new OAuth2PkceRuntime(options);
  return Object.freeze({
    begin: (input, context) => runtime.begin(input, context),
    callback: (input, context) => runtime.callback(input, context),
    refresh: (input, context) => runtime.refresh(input, context),
    revoke: (input, context) => runtime.revoke(input, context),
  });
}

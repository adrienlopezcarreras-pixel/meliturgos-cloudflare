import { requireValue } from '../core/contracts.js';
import { createOAuth2, createOAuthHttpTokenClient } from './oauth.js';
import { definition as gmailDefinition } from './gmail.js';
import { definition as calendarDefinition } from './google-calendar.js';
import { definition as tasksDefinition } from './google-tasks.js';
import { createD1OAuthVaults, createOAuthAccessTokenResolver } from './d1-oauth-vault.js';

const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOCATION_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const DEFAULT_REDIRECT_URI = 'https://meliturgos.adrien-lopezcarreras.workers.dev/api/gen2/connectors/oauth/callback';

const DEFINITIONS = new Map([
  [gmailDefinition.id, gmailDefinition],
  [calendarDefinition.id, calendarDefinition],
  [tasksDefinition.id, tasksDefinition],
]);

function oauthError(code, status = 400) {
  return Object.assign(new Error(code), { code, status });
}

function text(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}

function connectorDefinition(id) {
  const definition = DEFINITIONS.get(text(id, 160));
  if (!definition) throw oauthError('GOOGLE_OAUTH_CONNECTOR_UNSUPPORTED', 404);
  return definition;
}

function manifestFromDefinition(definition) {
  const scopeEntries = Object.entries(definition.oauth_scopes || {}).filter(([, value]) => text(value, 500));
  requireValue(scopeEntries.length > 0, 'GOOGLE_OAUTH_SCOPES_REQUIRED', 500);
  const readEntry = scopeEntries.find(([key]) => key === 'read') || scopeEntries[0];
  const required = [text(readEntry[1], 500)];
  const optional = [...new Set(
    scopeEntries
      .filter(([key]) => key !== readEntry[0])
      .map(([, value]) => text(value, 500))
      .filter(Boolean),
  )].sort();
  return Object.freeze({
    id: definition.id,
    name: definition.id,
    version: '1.0.0',
    auth: 'oauth2',
    capabilities: [...definition.capabilities],
    scopes: {
      required,
      optional,
    },
  });
}

function redirectUri(env = {}) {
  const configured = text(env.GOOGLE_OAUTH_REDIRECT_URI || env.MEL_GOOGLE_OAUTH_REDIRECT_URI, 1000);
  const value = configured || DEFAULT_REDIRECT_URI;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw oauthError('GOOGLE_OAUTH_REDIRECT_URI_INVALID', 500);
  }
  requireValue(url.protocol === 'https:' && !url.username && !url.password && !url.hash, 'GOOGLE_OAUTH_REDIRECT_URI_INVALID', 500);
  return url.toString();
}

function clientId(env = {}) {
  const value = text(env.GOOGLE_OAUTH_CLIENT_ID, 1000);
  requireValue(value, 'GOOGLE_OAUTH_CLIENT_ID_REQUIRED', 503);
  return value;
}

function clientSecret(env = {}) {
  return text(env.GOOGLE_OAUTH_CLIENT_SECRET, 2000);
}

function publicStatus(connectorId, tokenSet) {
  return Object.freeze({
    connector_id: connectorId,
    authorized: Boolean(tokenSet?.access_token),
    token_type: text(tokenSet?.token_type || 'Bearer', 80),
    scopes: Array.isArray(tokenSet?.scopes) ? tokenSet.scopes.map(value => text(value, 500)).filter(Boolean) : [],
    expires_at: Number.isFinite(Number(tokenSet?.expires_at)) ? Number(tokenSet.expires_at) : null,
    refreshable: Boolean(tokenSet?.refresh_token),
  });
}

export function googleOAuthManifest(connectorId) {
  return manifestFromDefinition(connectorDefinition(connectorId));
}

export function googleOAuthConnectorIds() {
  return Object.freeze([...DEFINITIONS.keys()]);
}

export function createGoogleOAuthRuntime(env = {}, {
  fetcher = fetch,
  vaults = null,
  now = () => Date.now(),
  transactionTtlMs,
} = {}) {
  requireValue(env?.DB?.prepare || vaults, 'GOOGLE_OAUTH_DB_REQUIRED', 503);
  const resolvedVaults = vaults || createD1OAuthVaults(env, { now });
  const tokenClient = createOAuthHttpTokenClient({
    fetcher,
    resolveClientSecret: async connectorId => {
      connectorDefinition(connectorId);
      return clientSecret(env) || null;
    },
  });

  const oauth = createOAuth2({
    resolveProvider: async connectorId => {
      connectorDefinition(connectorId);
      return {
        connector_id: connectorId,
        auth: 'oauth2',
        client_id: clientId(env),
        authorization_endpoint: GOOGLE_AUTHORIZATION_ENDPOINT,
        token_endpoint: GOOGLE_TOKEN_ENDPOINT,
        revocation_endpoint: GOOGLE_REVOCATION_ENDPOINT,
        redirect_uri: redirectUri(env),
        extra_authorization_params: {
          access_type: 'offline',
          include_granted_scopes: 'true',
          prompt: 'consent',
        },
      };
    },
    resolveManifest: async connectorId => googleOAuthManifest(connectorId),
    transactionVault: resolvedVaults.transactionVault,
    tokenVault: resolvedVaults.tokenVault,
    tokenClient,
    now,
    ...(transactionTtlMs === undefined ? {} : { transactionTtlMs }),
  });

  const resolveAccessToken = createOAuthAccessTokenResolver({
    tokenVault: resolvedVaults.tokenVault,
    oauth,
    now,
  });

  return Object.freeze({
    oauth,
    tokenVault: resolvedVaults.tokenVault,
    transactionVault: resolvedVaults.transactionVault,
    resolveAccessToken,

    async status(connectorId, context = {}) {
      connectorDefinition(connectorId);
      const owner = text(context.owner, 300);
      requireValue(owner, 'OAUTH_OWNER_REQUIRED', 401);
      const tokenSet = await resolvedVaults.tokenVault.get({
        owner,
        connector_id: connectorId,
      });
      return publicStatus(connectorId, tokenSet);
    },

    async statusAll(context = {}) {
      const rows = [];
      for (const connectorId of DEFINITIONS.keys()) rows.push(await this.status(connectorId, context));
      return Object.freeze(rows);
    },
  });
}

export function createGoogleTokenResolverFromEnv(env = {}, options = {}) {
  if (typeof env.MEL_GOOGLE_TOKEN_RESOLVER === 'function') return env.MEL_GOOGLE_TOKEN_RESOLVER;
  if (!env?.DB?.prepare || !env.MEL_OAUTH_TOKEN_KEY_B64 || !env.MEL_OAUTH_TOKEN_KEY_ID) return null;
  try {
    return createGoogleOAuthRuntime(env, options).resolveAccessToken;
  } catch {
    return null;
  }
}

import { DomainError, requireValue } from '../core/contracts.js';
import { createOAuth2, createOAuthHttpTokenClient } from './oauth.js';
import { createD1OAuthVaults } from './d1-oauth-vault.js';

const GOOGLE_AUTHORIZATION = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE = 'https://oauth2.googleapis.com/revoke';

const MANIFESTS = Object.freeze({
  gmail: Object.freeze({
    id: 'gmail',
    name: 'Gmail',
    version: '1.0.0',
    auth: 'oauth2',
    capabilities: Object.freeze([
      'gmail.messages.search',
      'gmail.messages.read',
      'gmail.drafts.create',
      'gmail.messages.send',
    ]),
    scopes: Object.freeze({
      required: Object.freeze(['https://www.googleapis.com/auth/gmail.readonly']),
      optional: Object.freeze([
        'https://www.googleapis.com/auth/gmail.compose',
        'https://www.googleapis.com/auth/gmail.send',
      ]),
    }),
  }),
  'google-calendar': Object.freeze({
    id: 'google-calendar',
    name: 'Google Calendar',
    version: '1.0.0',
    auth: 'oauth2',
    capabilities: Object.freeze([
      'calendar.events.read',
      'calendar.events.create',
      'calendar.events.update',
      'calendar.events.delete',
    ]),
    scopes: Object.freeze({
      required: Object.freeze(['https://www.googleapis.com/auth/calendar.events.readonly']),
      optional: Object.freeze(['https://www.googleapis.com/auth/calendar.events']),
    }),
  }),
  'google-tasks': Object.freeze({
    id: 'google-tasks',
    name: 'Google Tasks',
    version: '1.0.0',
    auth: 'oauth2',
    capabilities: Object.freeze([
      'tasks.tasklists.read',
      'tasks.tasks.read',
      'tasks.tasks.create',
      'tasks.tasks.update',
      'tasks.tasks.delete',
    ]),
    scopes: Object.freeze({
      required: Object.freeze(['https://www.googleapis.com/auth/tasks.readonly']),
      optional: Object.freeze(['https://www.googleapis.com/auth/tasks']),
    }),
  }),
});

function oauthError(code, status = 503) {
  return new DomainError(code, status);
}

function clean(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function publicOrigin(env = {}) {
  const raw = clean(env.MEL_PUBLIC_ORIGIN || env.GOOGLE_OAUTH_REDIRECT_ORIGIN, 500);
  requireValue(raw, 'GOOGLE_OAUTH_PUBLIC_ORIGIN_REQUIRED', 503);
  let url;
  try { url = new URL(raw); }
  catch { throw oauthError('GOOGLE_OAUTH_PUBLIC_ORIGIN_INVALID'); }
  requireValue(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash, 'GOOGLE_OAUTH_PUBLIC_ORIGIN_INVALID', 503);
  return url.origin;
}

function clientId(env = {}) {
  const value = clean(env.GOOGLE_OAUTH_CLIENT_ID, 1000);
  requireValue(value, 'GOOGLE_OAUTH_CLIENT_ID_REQUIRED', 503);
  return value;
}

function connectorManifest(connectorId) {
  const manifest = MANIFESTS[clean(connectorId, 160)];
  requireValue(manifest, 'GOOGLE_OAUTH_CONNECTOR_UNSUPPORTED', 404);
  return structuredClone(manifest);
}

function providerFor(env, connectorId) {
  const id = clean(connectorId, 160);
  connectorManifest(id);
  const origin = publicOrigin(env);
  return {
    connector_id: id,
    auth: 'oauth2',
    client_id: clientId(env),
    authorization_endpoint: GOOGLE_AUTHORIZATION,
    token_endpoint: GOOGLE_TOKEN,
    revocation_endpoint: GOOGLE_REVOKE,
    redirect_uri: origin + '/api/gen2/oauth/google/' + encodeURIComponent(id) + '/callback',
    extra_authorization_params: {
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    },
  };
}

function googleTokenClient({ env = {}, fetcher = fetch } = {}) {
  const base = createOAuthHttpTokenClient({
    fetcher,
    resolveClientSecret: async connectorId => {
      connectorManifest(connectorId);
      const secret = clean(env.GOOGLE_OAUTH_CLIENT_SECRET, 2000);
      requireValue(secret, 'GOOGLE_OAUTH_CLIENT_SECRET_REQUIRED', 503);
      return secret;
    },
  });

  return Object.freeze({
    exchange: (input, context) => base.exchange(input, context),
    refresh: (input, context) => base.refresh(input, context),
    async revoke(input = {}, context = {}) {
      connectorManifest(input.connector_id);
      const token = clean(input.refresh_token || input.access_token, 20000);
      requireValue(token, 'OAUTH_REVOKE_TOKEN_REQUIRED', 500);
      let response;
      try {
        response = await fetcher(GOOGLE_REVOKE, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            accept: 'application/json',
          },
          body: new URLSearchParams({ token }).toString(),
          redirect: 'error',
          signal: context?.signal || AbortSignal.timeout(8000),
        });
      } catch {
        throw oauthError('GOOGLE_OAUTH_REVOKE_FAILED', 503);
      }
      if (!response?.ok) {
        await response?.body?.cancel?.();
        throw oauthError('GOOGLE_OAUTH_REVOKE_FAILED', response?.status === 401 || response?.status === 403 ? 403 : 502);
      }
      await response.body?.cancel?.();
      return Object.freeze({ ok: true });
    },
  });
}

export function googleOAuthConnectorIds() {
  return Object.freeze(Object.keys(MANIFESTS));
}

export function googleOAuthManifest(connectorId) {
  return connectorManifest(connectorId);
}

export function createGoogleOAuthRuntime({ env = {}, fetcher = fetch, vaults = null } = {}) {
  const durableVaults = vaults || createD1OAuthVaults(env);
  const tokenClient = googleTokenClient({ env, fetcher });
  const oauth = createOAuth2({
    resolveProvider: async connectorId => providerFor(env, connectorId),
    resolveManifest: async connectorId => connectorManifest(connectorId),
    transactionVault: durableVaults.transactionVault,
    tokenVault: durableVaults.tokenVault,
    tokenClient,
  });

  return Object.freeze({
    oauth,
    vaults: durableVaults,
    accessTokenResolver: durableVaults.accessTokenResolver(),
    connector_ids: googleOAuthConnectorIds(),
    manifest: googleOAuthManifest,
  });
}

export function createGoogleAccessTokenResolver(env = {}, options = {}) {
  if (!env?.DB || !env.MEL_OAUTH_ENCRYPTION_KEY_ID || !env.MEL_OAUTH_ENCRYPTION_KEY_B64) return null;
  const vaults = options.vaults || createD1OAuthVaults(env, options);
  return vaults.accessTokenResolver();
}

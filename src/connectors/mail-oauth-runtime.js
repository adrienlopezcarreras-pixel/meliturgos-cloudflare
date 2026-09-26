import { DomainError, requireValue } from '../core/contracts.js';
import { createOAuth2, createOAuthHttpTokenClient } from './oauth.js';
import { createD1OAuthVaults } from './d1-oauth-vault.js';

const PROVIDERS = Object.freeze({
  microsoft: Object.freeze({
    authorization_endpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token_endpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    client_id_env: 'MICROSOFT_OAUTH_CLIENT_ID',
    client_secret_env: 'MICROSOFT_OAUTH_CLIENT_SECRET',
    connectors: Object.freeze({
      'microsoft-mail': Object.freeze({
        id: 'microsoft-mail',
        name: 'Microsoft Mail',
        version: '1.0.0',
        auth: 'oauth2',
        capabilities: Object.freeze([
          'mail.messages.search',
          'mail.messages.read',
          'mail.messages.move',
          'mail.messages.send',
        ]),
        scopes: Object.freeze({
          required: Object.freeze(['https://graph.microsoft.com/Mail.Read']),
          optional: Object.freeze([
            'https://graph.microsoft.com/Mail.ReadWrite',
            'https://graph.microsoft.com/Mail.Send',
          ]),
          authorization_only: Object.freeze(['offline_access']),
        }),
      }),
      'microsoft-onedrive': Object.freeze({
        id: 'microsoft-onedrive',
        name: 'Microsoft OneDrive',
        version: '1.0.0',
        auth: 'oauth2',
        capabilities: Object.freeze([
          'files.list',
          'files.read',
          'files.search',
          'files.write',
          'files.delete',
        ]),
        scopes: Object.freeze({
          required: Object.freeze(['https://graph.microsoft.com/Files.Read.All']),
          optional: Object.freeze(['https://graph.microsoft.com/Files.ReadWrite.All']),
          authorization_only: Object.freeze(['offline_access']),
        }),
      }),
      'microsoft-sharepoint': Object.freeze({
        id: 'microsoft-sharepoint',
        name: 'Microsoft SharePoint',
        version: '1.0.0',
        auth: 'oauth2',
        capabilities: Object.freeze([
          'sites.list',
          'sites.read',
          'sites.search',
          'sites.write',
        ]),
        scopes: Object.freeze({
          required: Object.freeze([
            'https://graph.microsoft.com/Files.Read.All',
            'https://graph.microsoft.com/Sites.Read.All',
          ]),
          optional: Object.freeze([
            'https://graph.microsoft.com/Files.ReadWrite.All',
            'https://graph.microsoft.com/Sites.ReadWrite.All',
          ]),
          authorization_only: Object.freeze(['offline_access']),
        }),
      }),
    }),
  }),
  yahoo: Object.freeze({
    authorization_endpoint: 'https://api.login.yahoo.com/oauth2/request_auth',
    token_endpoint: 'https://api.login.yahoo.com/oauth2/get_token',
    client_id_env: 'YAHOO_OAUTH_CLIENT_ID',
    client_secret_env: 'YAHOO_OAUTH_CLIENT_SECRET',
    connectors: Object.freeze({
      'yahoo-mail': Object.freeze({
        id: 'yahoo-mail',
        name: 'Yahoo Mail / Ymail',
        version: '1.0.0',
        auth: 'oauth2',
        capabilities: Object.freeze([
          'mail.messages.search',
          'mail.messages.read',
          'mail.messages.send',
        ]),
        scopes: Object.freeze({
          required: Object.freeze(['mail-r']),
          optional: Object.freeze(['mail-w']),
          authorization_only: Object.freeze(['openid']),
        }),
      }),
    }),
  }),
});

function clean(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function oauthError(code, status = 503) {
  return new DomainError(code, status);
}

function publicOrigin(env = {}) {
  const raw = clean(env.MEL_PUBLIC_ORIGIN || env.MAIL_OAUTH_REDIRECT_ORIGIN, 500);
  requireValue(raw, 'MAIL_OAUTH_PUBLIC_ORIGIN_REQUIRED', 503);
  let url;
  try { url = new URL(raw); }
  catch { throw oauthError('MAIL_OAUTH_PUBLIC_ORIGIN_INVALID'); }
  requireValue(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash, 'MAIL_OAUTH_PUBLIC_ORIGIN_INVALID', 503);
  return url.origin;
}

function providerDefinition(providerId) {
  const provider = PROVIDERS[clean(providerId, 80)];
  requireValue(provider, 'MAIL_OAUTH_PROVIDER_UNSUPPORTED', 404);
  return provider;
}

function manifestFor(providerId, connectorId) {
  const manifest = providerDefinition(providerId).connectors[clean(connectorId, 160)];
  requireValue(manifest, 'MAIL_OAUTH_CONNECTOR_UNSUPPORTED', 404);
  return structuredClone(manifest);
}

function providerFor(env, providerId, connectorId) {
  const provider = providerDefinition(providerId);
  const manifest = manifestFor(providerId, connectorId);
  const clientId = clean(env[provider.client_id_env], 1000);
  requireValue(clientId, providerId.toUpperCase() + '_OAUTH_CLIENT_ID_REQUIRED', 503);
  return {
    connector_id: manifest.id,
    auth: 'oauth2',
    client_id: clientId,
    authorization_endpoint: provider.authorization_endpoint,
    token_endpoint: provider.token_endpoint,
    redirect_uri: publicOrigin(env) + '/api/gen2/oauth/' + encodeURIComponent(providerId) + '/' + encodeURIComponent(manifest.id) + '/callback',
    extra_authorization_params: providerId === 'yahoo'
      ? { prompt: 'consent' }
      : { prompt: 'select_account' },
  };
}

function tokenClientFor(env, providerId, fetcher) {
  const provider = providerDefinition(providerId);
  const base = createOAuthHttpTokenClient({
    fetcher,
    resolveClientSecret: async connectorId => {
      manifestFor(providerId, connectorId);
      const secret = clean(env[provider.client_secret_env], 2000);
      requireValue(secret, providerId.toUpperCase() + '_OAUTH_CLIENT_SECRET_REQUIRED', 503);
      return secret;
    },
  });

  return Object.freeze({
    exchange: (input, context) => base.exchange(input, context),
    refresh: (input, context) => base.refresh(input, context),
    async revoke() {
      throw oauthError('MAIL_OAUTH_REMOTE_REVOCATION_UNSUPPORTED', 409);
    },
  });
}

export function mailOAuthProviderIds() {
  return Object.freeze(Object.keys(PROVIDERS));
}

export function mailOAuthConnectorIds(providerId) {
  return Object.freeze(Object.keys(providerDefinition(providerId).connectors));
}

export function mailOAuthManifest(providerId, connectorId) {
  return manifestFor(providerId, connectorId);
}

export function createMailOAuthRuntime({ providerId, env = {}, fetcher = fetch, vaults = null } = {}) {
  const providerKey = clean(providerId, 80);
  providerDefinition(providerKey);
  const durableVaults = vaults || createD1OAuthVaults(env);
  const oauth = createOAuth2({
    resolveProvider: async connectorId => providerFor(env, providerKey, connectorId),
    resolveManifest: async connectorId => manifestFor(providerKey, connectorId),
    transactionVault: durableVaults.transactionVault,
    tokenVault: durableVaults.tokenVault,
    tokenClient: tokenClientFor(env, providerKey, fetcher),
  });

  const status = async (connectorId, context = {}) => {
    const id = clean(connectorId, 160);
    manifestFor(providerKey, id);
    const owner = clean(context.owner, 200);
    requireValue(owner, 'OAUTH_OWNER_REQUIRED', 401);
    const tokenSet = await durableVaults.tokenVault.get({ owner, connector_id: id });
    return Object.freeze({
      provider: providerKey,
      connector_id: id,
      authorized: Boolean(tokenSet?.access_token),
      scopes: Array.isArray(tokenSet?.scopes) ? [...tokenSet.scopes] : [],
      expires_at: Number.isFinite(Number(tokenSet?.expires_at)) ? Number(tokenSet.expires_at) : null,
      refreshable: Boolean(tokenSet?.refresh_token),
    });
  };

  const accessTokenResolver = async (connectorId, context = {}) => {
    const id = clean(connectorId, 160);
    manifestFor(providerKey, id);
    const owner = clean(context.owner, 200);
    requireValue(owner, 'OAUTH_OWNER_REQUIRED', 401);
    let tokenSet = await durableVaults.tokenVault.get({ owner, connector_id: id });
    if (!tokenSet?.access_token) return '';
    const expiresAt = Number(tokenSet.expires_at);
    const shouldRefresh = Number.isFinite(expiresAt)
      && expiresAt <= Date.now() + 60_000
      && Boolean(tokenSet.refresh_token);
    if (shouldRefresh) {
      await oauth.refresh({ connector_id: id }, context);
      tokenSet = await durableVaults.tokenVault.get({ owner, connector_id: id });
    }
    return clean(tokenSet?.access_token, 20000);
  };

  return Object.freeze({
    provider: providerKey,
    oauth,
    vaults: durableVaults,
    status,
    accessTokenResolver,
    connector_ids: mailOAuthConnectorIds(providerKey),
    manifest: connectorId => mailOAuthManifest(providerKey, connectorId),
  });
}

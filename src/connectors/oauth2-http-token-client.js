import { DomainError, requireValue } from '../core/contracts.js';

const MAX_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 8_000;

function oauthHttpError(code, status = 502) {
  return new DomainError(code, status);
}

function text(value) {
  return String(value ?? '').trim();
}

function trustedEndpoint(value, code) {
  let url;
  try {
    url = new URL(text(value));
  } catch {
    throw oauthHttpError(code, 500);
  }
  const localHttp = url.protocol === 'http:'
    && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1');
  requireValue(url.protocol === 'https:' || localHttp, code, 500);
  requireValue(!url.username && !url.password && !url.hash, code, 500);
  return url.toString();
}

async function readJson(response, failureCode) {
  const contentLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw oauthHttpError('OAUTH_PROVIDER_RESPONSE_TOO_LARGE');
  }
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) {
    throw oauthHttpError('OAUTH_PROVIDER_RESPONSE_TOO_LARGE');
  }
  if (!response.ok) throw oauthHttpError(failureCode);
  try {
    const parsed = body ? JSON.parse(body) : {};
    requireValue(parsed && typeof parsed === 'object' && !Array.isArray(parsed), 'OAUTH_PROVIDER_JSON_INVALID', 502);
    return parsed;
  } catch (error) {
    if (error?.code) throw error;
    throw oauthHttpError('OAUTH_PROVIDER_JSON_INVALID');
  }
}

function timeout(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.max(1_000, Math.min(30_000, Math.trunc(parsed)));
}

async function credentials(resolveClientSecret, connectorId, context) {
  if (typeof resolveClientSecret !== 'function') return null;
  const value = await resolveClientSecret(connectorId, context);
  if (value == null || value === '') return null;
  const secret = text(value);
  requireValue(secret, 'OAUTH_CLIENT_SECRET_INVALID', 500);
  return secret;
}

/**
 * Generic server-side OAuth token client.
 *
 * All endpoints come from trusted provider config. Client secret resolution is
 * injected server-side and never returned. Redirects are disabled to prevent
 * credential forwarding to an unexpected origin.
 */
export function createOAuthHttpTokenClient({
  fetcher = fetch,
  resolveClientSecret = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetcher !== 'function') throw new Error('OAUTH_FETCHER_REQUIRED');
  if (resolveClientSecret != null && typeof resolveClientSecret !== 'function') {
    throw new Error('OAUTH_CLIENT_SECRET_RESOLVER_INVALID');
  }
  const requestTimeout = timeout(timeoutMs);

  async function postForm(endpoint, params, failureCode, context) {
    const response = await fetcher(trustedEndpoint(endpoint, 'OAUTH_TOKEN_ENDPOINT_INVALID'), {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams(params).toString(),
      redirect: 'error',
      signal: context?.signal || AbortSignal.timeout(requestTimeout),
    });
    return readJson(response, failureCode);
  }

  return Object.freeze({
    async exchange(input = {}, context = {}) {
      const provider = input.provider || {};
      const clientId = text(provider.client_id);
      const connectorId = text(input.connector_id);
      requireValue(clientId && connectorId, 'OAUTH_TOKEN_CLIENT_CONFIG_INVALID', 500);
      const secret = await credentials(resolveClientSecret, connectorId, context);
      return postForm(provider.token_endpoint, {
        grant_type: 'authorization_code',
        client_id: clientId,
        ...(secret ? { client_secret: secret } : {}),
        code: text(input.code),
        redirect_uri: text(input.redirect_uri),
        code_verifier: text(input.code_verifier),
      }, 'OAUTH_TOKEN_EXCHANGE_FAILED', context);
    },

    async refresh(input = {}, context = {}) {
      const provider = input.provider || {};
      const clientId = text(provider.client_id);
      const connectorId = text(input.connector_id);
      requireValue(clientId && connectorId, 'OAUTH_TOKEN_CLIENT_CONFIG_INVALID', 500);
      const secret = await credentials(resolveClientSecret, connectorId, context);
      return postForm(provider.token_endpoint, {
        grant_type: 'refresh_token',
        client_id: clientId,
        ...(secret ? { client_secret: secret } : {}),
        refresh_token: text(input.refresh_token),
      }, 'OAUTH_TOKEN_REFRESH_FAILED', context);
    },

    async revoke(input = {}, context = {}) {
      const provider = input.provider || {};
      const clientId = text(provider.client_id);
      const connectorId = text(input.connector_id);
      requireValue(clientId && connectorId, 'OAUTH_TOKEN_CLIENT_CONFIG_INVALID', 500);
      const endpoint = trustedEndpoint(provider.revocation_endpoint, 'OAUTH_REVOCATION_ENDPOINT_REQUIRED');
      const secret = await credentials(resolveClientSecret, connectorId, context);
      const token = text(input.refresh_token || input.access_token);
      requireValue(token, 'OAUTH_REVOKE_TOKEN_REQUIRED', 500);

      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: new URLSearchParams({
          token,
          client_id: clientId,
          ...(secret ? { client_secret: secret } : {}),
        }).toString(),
        redirect: 'error',
        signal: context?.signal || AbortSignal.timeout(requestTimeout),
      });
      if (!response.ok) {
        await response.body?.cancel?.();
        throw oauthHttpError('OAUTH_PROVIDER_REVOKE_FAILED');
      }
      await response.body?.cancel?.();
      return Object.freeze({ ok: true });
    },
  });
}

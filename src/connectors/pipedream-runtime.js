import { createD1OAuthVaults } from './d1-oauth-vault.js';

const CONFIG_ID = 'pipedream-connect-config';

function clean(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}

function runtimeError(code, status = 502, detail = {}) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  if (detail.upstream_status) error.upstream_status = Number(detail.upstream_status);
  if (detail.upstream_code) error.upstream_code = clean(detail.upstream_code, 160);
  return error;
}

function environment(config = {}) {
  return config?.environment === 'production' ? 'production' : 'development';
}

function candidates(config = {}) {
  return environment(config) === 'production' ? ['production', 'development'] : ['development'];
}

function b64UrlUtf8(value) {
  const bytes = new TextEncoder().encode(String(value ?? ''));
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

async function responsePayload(response) {
  const raw = await response.text().catch(() => '');
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch { return { text: raw.slice(0, 120_000) }; }
}

function sanitizedUpstream(body = {}) {
  return {
    upstream_code: clean(body?.code || body?.error?.code || body?.error, 160) || null,
  };
}

async function fetchJson(fetcher, url, init, code) {
  let response;
  try {
    response = await fetcher(url, {
      ...init,
      redirect: 'manual',
      signal: init?.signal || AbortSignal.timeout(12_000),
    });
  } catch {
    throw runtimeError(code, 503);
  }
  const body = await responsePayload(response);
  if (!response.ok) {
    throw runtimeError(
      code,
      response.status === 401 || response.status === 403 ? 409 : 502,
      { upstream_status: response.status, ...sanitizedUpstream(body) },
    );
  }
  return body;
}

export async function loadPipedreamRuntimeConfig(env = {}, owner = '') {
  if (!env?.DB) throw runtimeError('PIPEDREAM_RUNTIME_DB_REQUIRED', 503);
  const contextOwner = clean(owner || env.MELITURGOS_USER || 'owner', 200);
  const stored = await createD1OAuthVaults(env).tokenVault.get({
    owner: contextOwner,
    connector_id: CONFIG_ID,
  });
  if (!stored?.project_id || !stored?.client_id || !stored?.client_secret) {
    throw runtimeError('PIPEDREAM_NOT_CONFIGURED', 409);
  }
  return {
    project_id: clean(stored.project_id, 300),
    client_id: clean(stored.client_id, 1000),
    client_secret: clean(stored.client_secret, 2000),
    environment: environment(stored),
  };
}

export async function pipedreamRuntimeAccessToken(config, { fetcher = fetch, signal } = {}) {
  const body = await fetchJson(fetcher, 'https://api.pipedream.com/v1/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clean(config?.client_id, 1000),
      client_secret: clean(config?.client_secret, 2000),
    }),
    signal,
  }, 'PIPEDREAM_AUTH_FAILED');
  const token = clean(body?.access_token, 10000);
  if (!token) throw runtimeError('PIPEDREAM_ACCESS_TOKEN_MISSING', 502);
  return token;
}

export async function listPipedreamRuntimeAccounts(config, owner, { fetcher = fetch, signal } = {}) {
  const token = await pipedreamRuntimeAccessToken(config, { fetcher, signal });
  const projectId = clean(config?.project_id, 300);
  const params = new URLSearchParams({
    external_user_id: clean(owner, 200),
    limit: '100',
  });
  let lastError = null;
  for (const envName of candidates(config)) {
    try {
      const body = await fetchJson(
        fetcher,
        'https://api.pipedream.com/v1/connect/' + encodeURIComponent(projectId) + '/accounts?' + params.toString(),
        {
          method: 'GET',
          headers: {
            authorization: 'Bearer ' + token,
            accept: 'application/json',
            'x-pd-environment': envName,
          },
          signal,
        },
        'PIPEDREAM_ACCOUNTS_FAILED',
      );
      const rows = Array.isArray(body?.data) ? body.data
        : Array.isArray(body?.accounts) ? body.accounts
          : Array.isArray(body) ? body : [];
      const accounts = rows.map(row => ({
        id: clean(row?.id, 300),
        app: clean(row?.app?.name_slug || row?.app?.nameSlug || row?.app, 160),
        healthy: row?.healthy !== false && row?.dead !== true && !row?.error,
      })).filter(row => row.id && row.app);
      return {
        token,
        environment: envName,
        configured_environment: environment(config),
        environment_fallback_used: envName !== environment(config),
        accounts,
      };
    } catch (error) {
      lastError = error;
      const status = Number(error?.upstream_status || 0);
      const mayRetry = envName === 'production' && [400, 401, 403].includes(status);
      if (!mayRetry) throw error;
    }
  }
  throw lastError || runtimeError('PIPEDREAM_ACCOUNTS_FAILED', 502);
}

function accountFor(rows, app) {
  const account = rows.find(row => row.app === app && row.healthy === true);
  if (!account?.id) throw runtimeError('PIPEDREAM_' + String(app || 'APP').toUpperCase().replace(/[^A-Z0-9]+/g, '_') + '_ACCOUNT_REQUIRED', 409);
  return account;
}

export function createPipedreamRuntime({ env = {}, fetcher = fetch } = {}) {
  return Object.freeze({
    async status(owner = env.MELITURGOS_USER || 'owner', options = {}) {
      const config = await loadPipedreamRuntimeConfig(env, owner);
      const inventory = await listPipedreamRuntimeAccounts(config, owner, {
        fetcher,
        signal: options.signal,
      });
      return {
        configured: true,
        environment: inventory.environment,
        connected_apps: [...new Set(inventory.accounts.filter(row => row.healthy).map(row => row.app))],
        healthy_account_count: inventory.accounts.filter(row => row.healthy).length,
      };
    },

    async proxy({ owner = env.MELITURGOS_USER || 'owner', app, url, method = 'GET', body, headers = {}, signal } = {}) {
      const target = new URL(String(url || ''));
      if (target.protocol !== 'https:' || target.username || target.password) {
        throw runtimeError('PIPEDREAM_PROXY_TARGET_INVALID', 400);
      }
      const config = await loadPipedreamRuntimeConfig(env, owner);
      const inventory = await listPipedreamRuntimeAccounts(config, owner, { fetcher, signal });
      const account = accountFor(inventory.accounts, clean(app, 160));
      const params = new URLSearchParams({
        external_user_id: clean(owner, 200),
        account_id: account.id,
      });
      const proxyUrl = 'https://api.pipedream.com/v1/connect/' + encodeURIComponent(config.project_id)
        + '/proxy/' + b64UrlUtf8(target.toString()) + '?' + params.toString();
      const requestHeaders = {
        authorization: 'Bearer ' + inventory.token,
        accept: 'application/json',
        'x-pd-environment': inventory.environment,
        ...headers,
      };
      let requestBody = body;
      if (body !== undefined && body !== null && typeof body !== 'string') {
        requestBody = JSON.stringify(body);
        if (!requestHeaders['content-type']) requestHeaders['content-type'] = 'application/json';
      }
      let response;
      try {
        response = await fetcher(proxyUrl, {
          method,
          headers: requestHeaders,
          body: requestBody,
          redirect: 'manual',
          signal: signal || AbortSignal.timeout(12_000),
        });
      } catch {
        throw runtimeError('PIPEDREAM_PROXY_FAILED', 503);
      }
      const payload = await responsePayload(response);
      if (!response.ok) {
        throw runtimeError(
          'PIPEDREAM_PROXY_FAILED',
          response.status === 401 || response.status === 403 ? 409 : 502,
          { upstream_status: response.status, ...sanitizedUpstream(payload) },
        );
      }
      return {
        provider: 'pipedream',
        app,
        account_id: account.id,
        environment: inventory.environment,
        status: response.status,
        body: payload,
      };
    },
  });
}

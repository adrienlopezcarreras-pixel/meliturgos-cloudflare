import { createMailOAuthRuntime, mailOAuthConnectorIds, mailOAuthProviderIds } from '../connectors/mail-oauth-runtime.js';

const PROVIDERS = new Set(mailOAuthProviderIds());

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function owner(env = {}) {
  return String(env.MELITURGOS_USER || 'owner').trim() || 'owner';
}

function safeError(error, fallback = 'MAIL_OAUTH_FAILED') {
  return json({
    ok: false,
    error: String(error?.code || error?.message || fallback).slice(0, 160),
    code: String(error?.code || fallback).slice(0, 160),
  }, Number(error?.status) || 500);
}

function browserRequest(request) {
  return String(request?.headers?.get('accept') || '').toLowerCase().includes('text/html');
}

function professorOAuthRedirect(url, connectorId, outcome, code = '') {
  const target = new URL('/professor', url.origin);
  target.searchParams.set('view', 'microsoft');
  target.searchParams.set('oauth', outcome);
  target.searchParams.set('connector', connectorId);
  if (code) target.searchParams.set('code', String(code).slice(0, 120));
  return new Response(null, {
    status: 303,
    headers: {
      location: target.pathname + target.search,
      'cache-control': 'no-store',
    },
  });
}

async function bodyObject(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) return {};
  const value = await request.json().catch(() => ({}));
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export async function maybeHandleMailOAuthApi(request, env = {}, url = new URL(request.url), options = {}) {
  const match = url.pathname.match(/^\/api\/gen2\/oauth\/(microsoft|yahoo)\/([^/]+)\/(status|begin|callback|refresh)$/);
  if (!match) return null;

  const providerId = match[1];
  const connectorId = decodeURIComponent(match[2]);
  const action = match[3];
  if (!PROVIDERS.has(providerId) || !new Set(mailOAuthConnectorIds(providerId)).has(connectorId)) {
    return json({ ok: false, code: 'MAIL_OAUTH_CONNECTOR_UNSUPPORTED' }, 404);
  }

  try {
    const runtime = options.runtime || createMailOAuthRuntime({
      providerId,
      env,
      fetcher: options.fetcher || fetch,
      vaults: options.vaults || null,
    });
    const context = { owner: owner(env), requestId: crypto.randomUUID(), signal: request.signal };

    if (action === 'status') {
      if (request.method !== 'GET') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
      return json({ ok: true, ...(await runtime.status(connectorId, context)) });
    }

    if (action === 'begin') {
      if (request.method !== 'POST') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
      const body = await bodyObject(request);
      const manifest = runtime.manifest(connectorId);
      const optional = body.full_access === true
        ? [...manifest.scopes.optional]
        : Array.isArray(body.optional_scopes) ? body.optional_scopes : [];
      return json({ ok: true, ...(await runtime.oauth.begin({ connector_id: connectorId, optional_scopes: optional }, context)) });
    }

    if (action === 'callback') {
      if (request.method !== 'GET') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
      if (String(url.searchParams.get('error') || '').trim()) {
        return browserRequest(request)
          ? professorOAuthRedirect(url, connectorId, 'denied', 'MAIL_OAUTH_PROVIDER_DENIED')
          : json({ ok: false, code: 'MAIL_OAUTH_PROVIDER_DENIED' }, 400);
      }
      const result = await runtime.oauth.callback({
        connector_id: connectorId,
        state: url.searchParams.get('state') || '',
        code: url.searchParams.get('code') || '',
      }, context);
      return browserRequest(request)
        ? professorOAuthRedirect(url, connectorId, 'connected')
        : json({ ok: true, ...result });
    }

    if (action === 'refresh') {
      if (request.method !== 'POST') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
      return json({ ok: true, ...(await runtime.oauth.refresh({ connector_id: connectorId }, context)) });
    }

    return json({ ok: false, code: 'NOT_FOUND' }, 404);
  } catch (error) {
    return safeError(error);
  }
}

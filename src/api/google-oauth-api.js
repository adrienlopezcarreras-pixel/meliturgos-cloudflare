import { approvedCapabilitiesFromRequest } from '../security/approval-gates.js';
import { createGoogleOAuthRuntime, googleOAuthConnectorIds } from '../connectors/google-oauth-runtime.js';

const CONNECTORS = new Set(googleOAuthConnectorIds());

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

function owner(env = {}) {
  return String(env.MELITURGOS_USER || 'owner').trim() || 'owner';
}

function approvalRequired(connectorId) {
  const error = new Error('EXPLICIT_APPROVAL_REQUIRED');
  error.code = 'EXPLICIT_APPROVAL_REQUIRED';
  error.status = 409;
  error.approval_scope = 'oauth.google.' + connectorId + '.revoke';
  throw error;
}

function safeError(error, fallback = 'GOOGLE_OAUTH_FAILED') {
  return json({
    ok: false,
    error: String(error?.code || error?.message || fallback).slice(0, 160),
    code: String(error?.code || fallback).slice(0, 160),
    ...(error?.approval_scope ? { approval_scope: String(error.approval_scope).slice(0, 200) } : {}),
  }, Number(error?.status) || 500);
}

async function bodyObject(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) return {};
  const value = await request.json().catch(() => ({}));
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export async function maybeHandleGoogleOAuthApi(request, env = {}, url = new URL(request.url), options = {}) {
  const match = url.pathname.match(/^\/api\/gen2\/oauth\/google\/([^/]+)\/(status|begin|callback|refresh|revoke)$/);
  if (!match) return null;

  const connectorId = decodeURIComponent(match[1]);
  const action = match[2];
  if (!CONNECTORS.has(connectorId)) {
    return json({ ok: false, error: 'GOOGLE_OAUTH_CONNECTOR_UNSUPPORTED', code: 'GOOGLE_OAUTH_CONNECTOR_UNSUPPORTED' }, 404);
  }

  try {
    const runtime = options.runtime || createGoogleOAuthRuntime({
      env,
      fetcher: options.fetcher || fetch,
      vaults: options.vaults || null,
    });
    const context = {
      owner: owner(env),
      requestId: crypto.randomUUID(),
      signal: request.signal,
    };

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
      const result = await runtime.oauth.begin({
        connector_id: connectorId,
        optional_scopes: optional,
      }, context);
      return json({ ok: true, ...result });
    }

    if (action === 'callback') {
      if (request.method !== 'GET') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
      const providerError = String(url.searchParams.get('error') || '').trim();
      if (providerError) {
        return json({ ok: false, error: 'GOOGLE_OAUTH_PROVIDER_DENIED', code: 'GOOGLE_OAUTH_PROVIDER_DENIED' }, 400);
      }
      const result = await runtime.oauth.callback({
        connector_id: connectorId,
        state: url.searchParams.get('state') || '',
        code: url.searchParams.get('code') || '',
      }, context);
      return json({ ok: true, ...result });
    }

    if (action === 'refresh') {
      if (request.method !== 'POST') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
      const result = await runtime.oauth.refresh({ connector_id: connectorId }, context);
      return json({ ok: true, ...result });
    }

    if (action === 'revoke') {
      if (request.method !== 'POST') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
      const scope = 'oauth.google.' + connectorId + '.revoke';
      if (!approvedCapabilitiesFromRequest(request).includes(scope)) approvalRequired(connectorId);
      const result = await runtime.oauth.revoke({ connector_id: connectorId }, context);
      return json({ ok: true, ...result });
    }

    return json({ ok: false, code: 'NOT_FOUND' }, 404);
  } catch (error) {
    return safeError(error);
  }
}

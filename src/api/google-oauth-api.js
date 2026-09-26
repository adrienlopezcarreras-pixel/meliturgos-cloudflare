import { createGoogleOAuthRuntime, googleOAuthConnectorIds } from '../connectors/google-oauth-runtime.js';
import { approvedCapabilitiesFromRequest } from '../security/approval-gates.js';

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

function context(env, request) {
  return {
    owner: String(env.MELITURGOS_USER || 'owner').trim(),
    permissions: Array.isArray(env.CAPABILITY_PERMISSIONS) ? env.CAPABILITY_PERMISSIONS : [],
    approvedCapabilities: approvedCapabilitiesFromRequest(request),
    requestId: crypto.randomUUID(),
  };
}

function safeError(error) {
  return {
    error: String(error?.message || error?.code || 'OAUTH_ERROR').slice(0, 160),
    code: String(error?.code || error?.message || 'OAUTH_ERROR').slice(0, 160),
  };
}

function supported(connectorId) {
  return googleOAuthConnectorIds().includes(String(connectorId || '').trim());
}

export async function handleGoogleOAuthApi(request, env, url = new URL(request.url)) {
  if (!url.pathname.startsWith('/api/gen2/connectors/oauth/')) return null;

  let runtime;
  try {
    runtime = createGoogleOAuthRuntime(env);
  } catch (error) {
    return json(safeError(error), Number(error?.status) || 503);
  }

  const ctx = context(env, request);

  try {
    if (url.pathname === '/api/gen2/connectors/oauth/status' && request.method === 'GET') {
      const rows = await runtime.statusAll(ctx);
      return json({
        ok: true,
        provider: 'google',
        connectors: rows,
        configured: Boolean(env.GOOGLE_OAUTH_CLIENT_ID)
          && Boolean(env.MEL_OAUTH_TOKEN_KEY_B64)
          && Boolean(env.MEL_OAUTH_TOKEN_KEY_ID),
      });
    }

    if (url.pathname === '/api/gen2/connectors/oauth/begin' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const connectorId = String(body.connector_id || '').trim();
      if (!supported(connectorId)) return json({ error:'unsupported connector', code:'GOOGLE_OAUTH_CONNECTOR_UNSUPPORTED' }, 404);
      const optionalScopes = Array.isArray(body.optional_scopes)
        ? body.optional_scopes.map(value => String(value || '').trim()).filter(Boolean).slice(0, 20)
        : [];
      const result = await runtime.oauth.begin({
        connector_id: connectorId,
        optional_scopes: optionalScopes,
      }, ctx);
      return json({ ok: true, ...result });
    }

    if (url.pathname === '/api/gen2/connectors/oauth/callback' && request.method === 'GET') {
      const state = String(url.searchParams.get('state') || '').trim();
      const code = String(url.searchParams.get('code') || '').trim();
      const requestedConnectorId = String(url.searchParams.get('connector_id') || '').trim();
      const connectorId = requestedConnectorId || await runtime.transactionVault.resolveConnector({
        owner: ctx.owner,
        state,
      }) || '';
      const providerError = String(url.searchParams.get('error') || '').trim();
      if (providerError) {
        return json({
          ok: false,
          error: 'GOOGLE_OAUTH_PROVIDER_DENIED',
          code: 'GOOGLE_OAUTH_PROVIDER_DENIED',
          provider_error: providerError.slice(0, 160),
        }, 400);
      }
      if (!supported(connectorId)) return json({ error:'unsupported connector', code:'GOOGLE_OAUTH_CONNECTOR_UNSUPPORTED' }, 404);
      const result = await runtime.oauth.callback({ connector_id: connectorId, state, code }, ctx);
      return new Response(`<!doctype html><html lang="fr"><meta charset="utf-8"><title>MEL — Google connecté</title>
<body style="font-family:system-ui;background:#080d1c;color:#e8f4ff;display:grid;place-items:center;min-height:100vh;margin:0">
<main style="max-width:560px;padding:32px;border:1px solid #1e88a8;border-radius:18px;background:#111930">
<h1 style="color:#41d9ff">Google connecté à MEL</h1>
<p>Le connecteur <strong>${connectorId.replace(/[<>&"]/g,'')}</strong> est autorisé.</p>
<p>Tu peux fermer cette fenêtre et revenir dans MEL.</p>
</main></body></html>`, {
        status: 200,
        headers: {
          'content-type':'text/html; charset=utf-8',
          'cache-control':'no-store',
          'x-content-type-options':'nosniff',
          'referrer-policy':'no-referrer',
        },
      });
    }

    if (url.pathname === '/api/gen2/connectors/oauth/refresh' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const connectorId = String(body.connector_id || '').trim();
      if (!supported(connectorId)) return json({ error:'unsupported connector', code:'GOOGLE_OAUTH_CONNECTOR_UNSUPPORTED' }, 404);
      const result = await runtime.oauth.refresh({ connector_id: connectorId }, ctx);
      return json({ ok: true, ...result });
    }

    if (url.pathname === '/api/gen2/connectors/oauth/revoke' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const connectorId = String(body.connector_id || '').trim();
      if (!supported(connectorId)) return json({ error:'unsupported connector', code:'GOOGLE_OAUTH_CONNECTOR_UNSUPPORTED' }, 404);
      const result = await runtime.oauth.revoke({ connector_id: connectorId }, ctx);
      return json({ ok: true, ...result });
    }

    return json({ error:'method not allowed', code:'METHOD_NOT_ALLOWED' }, 405, { allow:'GET, POST' });
  } catch (error) {
    return json(safeError(error), Number(error?.status) || 500);
  }
}

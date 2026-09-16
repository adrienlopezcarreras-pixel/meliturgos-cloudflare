import app from './professor-live-learning-entry.js';

function withoutTerminalNewline(value) {
  return String(value ?? '').replace(/[\r\n]+$/g, '');
}

function isBasicAuthorization(value) {
  return /^Basic\s+\S+/i.test(String(value || ''));
}

/**
 * Preview deployments intentionally keep their own generated local password.
 * For a browser using the owner's normal HTTP Basic credentials, verify those
 * credentials against the canonical production worker and, only after a 2xx
 * response, replace the header with the preview-local Bearer secret.
 *
 * The production password is never copied into GitHub or preview config. The
 * Basic header is forwarded only to the configured HTTPS verifier and is not
 * logged or persisted here. Bearer tokens are never forwarded to production.
 */
export async function bridgePreviewBasicAuth(request, env, fetchImpl = globalThis.fetch) {
  if (String(env?.MEL_RUNTIME_ENV || '') !== 'preview') return request;

  const authorization = request.headers.get('authorization') || '';
  if (!isBasicAuthorization(authorization)) return request;

  const localPassword = withoutTerminalNewline(env?.MELITURGOS_PASSWORD);
  const configuredVerifier = String(env?.MEL_PREVIEW_AUTH_VERIFY_URL || '').trim();
  if (!localPassword || !configuredVerifier || typeof fetchImpl !== 'function') return request;

  let verifier;
  let requestOrigin;
  try {
    verifier = new URL(configuredVerifier);
    requestOrigin = new URL(request.url).origin;
  } catch {
    return request;
  }
  if (verifier.protocol !== 'https:' || verifier.origin === requestOrigin) return request;

  try {
    const verification = await fetchImpl(verifier.toString(), {
      method: 'GET',
      headers: {
        authorization,
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'manual',
      cache: 'no-store',
    });
    const accepted = verification.status >= 200 && verification.status < 300;
    try { await verification.body?.cancel(); } catch {}
    if (!accepted) return request;

    const headers = new Headers(request.headers);
    headers.set('authorization', `Bearer ${localPassword}`);
    return new Request(request, { headers });
  } catch {
    return request;
  }
}

export default {
  async fetch(request, env, ctx) {
    const authenticatedRequest = await bridgePreviewBasicAuth(request, env);
    return app.fetch(authenticatedRequest, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    return app.scheduled(controller, env, ctx);
  },
};

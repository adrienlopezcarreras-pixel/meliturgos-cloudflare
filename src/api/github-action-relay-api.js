import { D1GitHubActionRelayStore } from '../platform/github-action-relay.js';

function withoutTerminalNewline(value) {
  return String(value ?? '').replace(/[\r\n]+$/g, '');
}

function safeEqual(left, right) {
  const a = String(left ?? '');
  const b = String(right ?? '');
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function authorized(request, env) {
  const expected = withoutTerminalNewline(env?.MEL_GITHUB_RELAY_TOKEN || '');
  const supplied = withoutTerminalNewline(request.headers.get('x-mel-github-relay') || '');
  return expected.length >= 32 && supplied.length === expected.length && safeEqual(expected, supplied);
}

function denied() {
  return Response.json({ ok: false, code: 'GITHUB_RELAY_AUTH_REQUIRED' }, {
    status: 401,
    headers: { 'cache-control': 'no-store' },
  });
}

export function githubActionRelayApi(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/internal/github-action-relay/')) return null;
  if (!authorized(request, env)) return denied();
  if (!env?.DB) return Response.json({ ok: false, code: 'GITHUB_RELAY_DB_REQUIRED' }, { status: 503 });

  return (async () => {
    const store = new D1GitHubActionRelayStore(env.DB);
    const body = await request.json().catch(() => ({}));

    if (url.pathname === '/api/internal/github-action-relay/heartbeat' && request.method === 'POST') {
      const health = await store.heartbeat({
        status: 'ONLINE',
        metadata: {
          run_id: Number(body?.run_id || 0) || null,
          repository: String(body?.repository || '').slice(0, 200) || null,
          source: 'github-actions',
        },
      });
      return Response.json({ ok: true, health }, { headers: { 'cache-control': 'no-store' } });
    }

    if (url.pathname === '/api/internal/github-action-relay/claim' && request.method === 'POST') {
      const job = await store.claim();
      return Response.json({ ok: true, job }, { headers: { 'cache-control': 'no-store' } });
    }

    if (url.pathname === '/api/internal/github-action-relay/result' && request.method === 'POST') {
      const job = await store.complete(body?.job_id, {
        status: body?.status,
        result: body?.result || null,
        error: body?.error || null,
      });
      return Response.json({ ok: true, job }, { headers: { 'cache-control': 'no-store' } });
    }

    return Response.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
  })().catch(error => Response.json({
    ok: false,
    code: String(error?.code || error?.message || 'GITHUB_RELAY_FAILED').slice(0, 180),
  }, { status: Number(error?.status || 500) }));
}

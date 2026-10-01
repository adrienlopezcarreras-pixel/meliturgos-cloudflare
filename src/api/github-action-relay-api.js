import { D1GitHubActionRelayStore } from '../platform/github-action-relay.js';
import { authorizeDevBridge } from '../core/dev-bridge-auth.js';
import { authorizeGitHubActionsOidcRequest } from '../security/github-actions-oidc.js';

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

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function sanitizeRepositoryMetadata(value, repository) {
  if (!value || typeof value !== 'object') return null;
  return {
    id: Number(value.id || 0),
    name: clean(value.name, 200),
    full_name: clean(value.full_name || repository, 240),
    private: Boolean(value.private),
    archived: Boolean(value.archived),
    disabled: Boolean(value.disabled),
    visibility: clean(value.visibility, 40),
    default_branch: clean(value.default_branch, 160),
    pushed_at: clean(value.pushed_at, 80),
    updated_at: clean(value.updated_at, 80),
  };
}

function sanitizeActionRuns(value) {
  const rows = Array.isArray(value) ? value : [];
  return rows.slice(0, 50).map(row => ({
    id: Number(row?.id || 0),
    name: clean(row?.name, 220),
    event: clean(row?.event, 80),
    status: clean(row?.status, 80),
    conclusion: clean(row?.conclusion, 80),
    head_branch: clean(row?.head_branch, 220),
    head_sha: clean(row?.head_sha, 64),
    run_number: Number(row?.run_number || 0),
    created_at: clean(row?.created_at, 80),
    updated_at: clean(row?.updated_at, 80),
    html_url: clean(row?.html_url, 1000),
  })).filter(row => row.id > 0);
}

export function githubActionRelayApi(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/internal/github-action-relay/')) return null;

  return (async () => {
    const bridgeDenied = authorizeDevBridge(request, env);
    let oidc = { ok: false };
    if (bridgeDenied && !authorized(request, env)) {
      oidc = await authorizeGitHubActionsOidcRequest(request, env, {
        allowedWorkflows: ['github-action-relay.yml'],
        allowedEvents: ['schedule', 'workflow_dispatch'],
      });
      if (!oidc.ok) {
        return Response.json({ ok: false, code: oidc.code || 'GITHUB_RELAY_AUTH_REQUIRED' }, {
          status: oidc.status || 401,
          headers: { 'cache-control': 'no-store' },
        });
      }
    }
    if (!env?.DB) return Response.json({ ok: false, code: 'GITHUB_RELAY_DB_REQUIRED' }, { status: 503 });
    const store = new D1GitHubActionRelayStore(env.DB);
    const body = await request.json().catch(() => ({}));

    if (url.pathname === '/api/internal/github-action-relay/heartbeat' && request.method === 'POST') {
      const health = await store.heartbeat({
        status: 'ONLINE',
        metadata: {
          run_id: Number(body?.run_id || 0) || null,
          repository: clean(body?.repository, 200) || null,
          source: 'github-actions',
          repository_metadata: sanitizeRepositoryMetadata(body?.repository_metadata, body?.repository),
          actions_runs: sanitizeActionRuns(body?.actions_runs),
          snapshot_at: clean(body?.snapshot_at, 80) || null,
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

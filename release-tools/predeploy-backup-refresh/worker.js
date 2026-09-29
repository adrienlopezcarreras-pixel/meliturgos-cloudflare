import { runScheduledSystemBackup } from '../../src/backup/system-backup-runtime.js';

const PATH = '/refresh';

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function equalToken(expected, supplied) {
  const a = new TextEncoder().encode(String(expected || ''));
  const b = new TextEncoder().encode(String(supplied || ''));
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    diff |= (a[i % Math.max(1, a.length)] || 0) ^ (b[i % Math.max(1, b.length)] || 0);
  }
  return a.length >= 32 && a.length === b.length && diff === 0;
}

function runtimeEnv(env, { sourceSha, sourceBranch }) {
  return new Proxy(env, {
    get(target, property, receiver) {
      if (property === 'MEL_DEPLOYED_GIT_SHA') return sourceSha;
      if (property === 'MEL_DEPLOYED_GIT_BRANCH') return sourceBranch;
      if (property === 'MEL_RUNTIME_ENV') return 'production';
      if (property === 'MEL_PREVIEW_ISOLATED') return 'false';
      return Reflect.get(target, property, receiver);
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== PATH) return json({ ok: false, status: 'NOT_FOUND' }, 404);
    if (request.method !== 'POST') return json({ ok: false, status: 'METHOD_NOT_ALLOWED' }, 405);

    const expected = String(env?.MEL_PREDEPLOY_BACKUP_REFRESH_TOKEN || '');
    const supplied = String(request.headers.get('x-mel-predeploy-backup-refresh') || '');
    if (!equalToken(expected, supplied)) return json({ ok: false, status: 'AUTH_REQUIRED' }, 401);

    let body = {};
    try { body = await request.json(); } catch {}
    const sourceSha = String(body?.source_sha || '').trim().toLowerCase();
    const sourceBranch = String(body?.source_branch || '').trim();
    if (!/^[0-9a-f]{40}$/.test(sourceSha) || !sourceBranch.startsWith('release/')) {
      return json({ ok: false, status: 'SOURCE_IDENTITY_INVALID' }, 400);
    }

    try {
      const result = await runScheduledSystemBackup(runtimeEnv(env, { sourceSha, sourceBranch }), {
        intervalMs: 15 * 60 * 1000,
        force: true,
        compactPostPersistVerify: true,
      });
      const ok = result?.ok === true
        && result?.status === 'CREATED_VERIFIED'
        && Boolean(result?.id)
        && /^[0-9a-f]{64}$/.test(String(result?.integritySha256 || '').toLowerCase());
      return json({
        ok,
        status: ok ? 'PREDEPLOY_BACKUP_REFRESH_CREATED' : (result?.status || 'BACKUP_REFRESH_FAILED'),
        backup: ok ? {
          id: result.id,
          integrity_sha256: result.integritySha256,
          source_count: Number(result.sourceCount || 0),
          source_sha: sourceSha,
          source_branch: sourceBranch,
          encrypted: true,
          restore_candidate_verified: true,
        } : null,
      }, ok ? 200 : 503);
    } catch (error) {
      return json({
        ok: false,
        status: 'PREDEPLOY_BACKUP_REFRESH_FAILED',
        code: String(error?.code || error?.message || error).slice(0, 220),
      }, 503);
    }
  },
};

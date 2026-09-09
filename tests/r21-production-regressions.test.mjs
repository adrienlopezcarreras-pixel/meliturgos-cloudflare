import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { inferNativeCodeCapability } from '../src/api/native-chat.js';
import { createGitHubCodeReader } from '../src/capabilities/github-code-capabilities.js';

function auth() {
  return { Authorization: `Basic ${btoa('adrien:pw')}` };
}

function baseEnv(extra = {}) {
  return {
    MELITURGOS_USER: 'adrien',
    MELITURGOS_PASSWORD: 'pw',
    ...extra,
  };
}

test('self-code access question deterministically selects code.read', () => {
  const inferred = inferNativeCodeCapability('et maintenant tu peux lire ton code ?');
  assert.equal(inferred?.id, 'code.read');
  assert.equal(inferred?.input?.path, 'src/router.js');
});

test('GitHub code reader remains usable when REST API is rate-limited', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(String(url));
    if (String(url).includes('/commits/')) return new Response('rate limited', { status: 403 });
    if (String(url).includes('api.github.com') && String(url).includes('/contents/')) return new Response('rate limited', { status: 403 });
    if (String(url).includes('raw.githubusercontent.com') && String(url).endsWith('/package.json')) return new Response('{"name":"meliturgos"}', { status: 200 });
    if (String(url).includes('raw.githubusercontent.com') && String(url).endsWith('/src/router.js')) return new Response('export default { fetch() {} };', { status: 200 });
    return new Response('not found', { status: 404 });
  };

  const reader = createGitHubCodeReader({
    repository: 'adrienlopezcarreras-pixel/meliturgos-cloudflare',
    branch: 'release/mel-2026-09-09-r2',
    fetchImpl,
  });
  assert.equal(await reader.health(), 'ONLINE');
  const result = await reader.read('src/router.js');
  assert.match(result.content, /export default/);
  assert.equal(result.branch, 'release/mel-2026-09-09-r2');
  assert.equal(calls.some(x => x.includes('raw.githubusercontent.com')), true);
});

test('GitHub code reader continues to deny secret-like paths', async () => {
  const reader = createGitHubCodeReader({
    repository: 'adrienlopezcarreras-pixel/meliturgos-cloudflare',
    branch: 'release/mel-2026-09-09-r2',
    fetchImpl: async () => new Response('no', { status: 500 }),
  });
  await assert.rejects(() => reader.read('.env'), /CODE_PATH_DENIED/);
});

test('memory status compatibility endpoint exists instead of falling through to unknown route', async () => {
  const response = await worker.fetch(new Request('https://mel.test/api/memory/status', { headers: auth() }), baseEnv(), {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.db_bound, false);
  assert.equal(typeof body.memory_count, 'number');
  assert.equal('interaction_count' in body, false);
});

test('portable memory export endpoint exists and never needs legacy worker.js', async () => {
  const response = await worker.fetch(new Request('https://mel.test/api/export', { headers: auth() }), baseEnv(), {});
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition') || '', /meliturgos-memory-/);
  const body = await response.json();
  assert.equal(body.format, 'meliturgos-memory-export');
  assert.deepEqual(body.memories, []);
});

test('Work health is safe preflight-only and does not expose the protected write bridge', async () => {
  const response = await worker.fetch(new Request('https://mel.test/api/dev-bridge/health', { headers: auth() }), baseEnv(), {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.mode, 'preflight-only');
  assert.equal(body.protected_write_bridge, true);
  assert.notEqual(body.code, 'BRIDGE_AUTH_REQUIRED');
});

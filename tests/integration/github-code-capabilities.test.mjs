import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityBus } from '../../src/capabilities/capability-bus.js';
import { createGitHubCodeReader, registerGitHubCodeCapabilities } from '../../src/capabilities/github-code-capabilities.js';

const enc = value => Buffer.from(String(value), 'utf8').toString('base64');
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fixtureFetch({ token = 'secret-token', healthStatus = 200 } = {}) {
  const calls = [];
  const files = {
    'src/router.js': 'export const route = "mvp-interface";\n',
    'src/pages/mvp-interface.js': 'export const title = "MELITURGOS";\nfunction renderMvp(){}\n',
    'README.md': '# MELITURGOS\n'
  };
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const u = new URL(url);
    if (u.pathname.includes('/commits/')) return json(healthStatus === 200 ? { sha: 'head' } : { message: 'health failure' }, healthStatus);
    if (u.pathname.includes('/git/trees/')) return json({ tree: Object.entries(files).map(([path, content]) => ({ path, type: 'blob', size: Buffer.byteLength(content) })) });
    const marker = '/contents/';
    const idx = u.pathname.indexOf(marker);
    if (idx >= 0) {
      const path = decodeURIComponent(u.pathname.slice(idx + marker.length));
      if (!(path in files)) return json({ message: 'not found' }, 404);
      return json({ type: 'file', size: Buffer.byteLength(files[path]), sha: `sha-${path}`, content: enc(files[path]) });
    }
    return json({ message: 'not found' }, 404);
  };
  return { fetchImpl, calls, token };
}

test('code.read reads bounded source and sends token only in authorization header', async () => {
  const fixture = fixtureFetch();
  const reader = createGitHubCodeReader({ repository: 'owner/repo', branch: 'mel-current', token: fixture.token, fetchImpl: fixture.fetchImpl });
  const out = await reader.read('src/router.js');
  assert.equal(out.path, 'src/router.js');
  assert.match(out.content, /mvp-interface/);
  assert.equal(out.branch, 'mel-current');
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].init.headers.authorization, `Bearer ${fixture.token}`);
  assert.ok(!fixture.calls[0].url.includes(fixture.token));
});

test('code.read rejects traversal and secret-like paths before network', async () => {
  const fixture = fixtureFetch();
  const reader = createGitHubCodeReader({ repository: 'owner/repo', fetchImpl: fixture.fetchImpl });
  for (const path of ['../worker.js', '.env', 'backups/dump.sql', 'secrets/token.txt']) {
    await assert.rejects(() => reader.read(path), /CODE_PATH_DENIED/);
  }
  assert.equal(fixture.calls.length, 0);
});

test('code.search searches a bounded safe tree and returns line evidence', async () => {
  const fixture = fixtureFetch();
  const reader = createGitHubCodeReader({ repository: 'owner/repo', fetchImpl: fixture.fetchImpl });
  const out = await reader.search({ query: 'MELITURGOS', path: 'src' });
  assert.equal(out.branch, 'mel-current');
  assert.equal(out.matches.length, 1);
  assert.equal(out.matches[0].path, 'src/pages/mvp-interface.js');
  assert.equal(out.matches[0].line, 1);
  assert.ok(out.searched_files <= 24);
});

test('health maps success, auth failure and transient failure', async () => {
  const mk = status => createGitHubCodeReader({ repository: 'owner/repo', fetchImpl: async () => new Response('{}', { status }) });
  assert.equal(await mk(200).health(), 'ONLINE');
  assert.equal(await mk(403).health(), 'OFFLINE');
  assert.equal(await mk(500).health(), 'DEGRADED');
  const broken = createGitHubCodeReader({ repository: 'owner/repo', fetchImpl: async () => { throw new Error('network'); } });
  assert.equal(await broken.health(), 'DEGRADED');
});

test('CapabilityBus executes registered code.read and code.search and refreshes health', async () => {
  const fixture = fixtureFetch({ token: '' });
  const bus = new CapabilityBus();
  registerGitHubCodeCapabilities(bus, { repository: 'owner/repo', fetchImpl: fixture.fetchImpl });
  const ctx = { owner: 'owner', permissions: [], requestId: 'req-1' };
  assert.equal(bus.health('code.read'), 'DEGRADED');
  const refreshed = await bus.refreshHealth('code.read');
  assert.equal(refreshed.health, 'HEALTHY');
  const read = await bus.execute('code.read', { path: 'src/router.js' }, ctx);
  assert.match(read.content, /mvp-interface/);
  const search = await bus.execute('code.search', { query: 'MELITURGOS', path: 'src' }, ctx);
  assert.equal(search.matches[0].path, 'src/pages/mvp-interface.js');
  assert.equal(bus.health('code.search'), 'HEALTHY');
});

test('CapabilityBus fails closed when GitHub code bridge is offline', async () => {
  const fixture = fixtureFetch({ token: '', healthStatus: 403 });
  const bus = new CapabilityBus();
  registerGitHubCodeCapabilities(bus, { repository: 'owner/repo', fetchImpl: fixture.fetchImpl });
  const ctx = { owner: 'owner', permissions: [], requestId: 'req-offline' };
  await assert.rejects(() => bus.execute('code.read', { path: 'src/router.js' }, ctx), /CAPABILITY_UNAVAILABLE/);
  assert.equal(bus.health('code.read'), 'UNAVAILABLE');
  assert.equal(fixture.calls.filter(call => call.url.includes('/contents/')).length, 0);
});

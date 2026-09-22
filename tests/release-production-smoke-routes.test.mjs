import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const TOKEN = 's'.repeat(64);
const SHA = 'b'.repeat(40);
const BRANCH = 'release/mel-hardware-v0.1.0';

function db() {
  const auditRows = [];
  return {
    prepare(sql) {
      return {
        params: [],
        bind(...params) { this.params = params; return this; },
        async first() {
          if (/COUNT\(\*\)/i.test(String(sql))) return { count: 3 };
          return null;
        },
        async all() {
          if (/FROM\s+audit_logs/i.test(String(sql))) {
            const since = Number(this.params[0]) || 0;
            const limit = Number(this.params[1]) || 200;
            return {
              results: auditRows
                .filter(row => Number(row.timestamp) >= since)
                .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
                .slice(0, limit),
            };
          }
          return { results: [] };
        },
        async run() {
          if (/INSERT\s+INTO\s+audit_logs/i.test(String(sql))) {
            auditRows.push({
              timestamp: this.params[0],
              action: this.params[1],
              path: this.params[2],
              details_json: this.params[3],
            });
          }
          return { success: true };
        },
      };
    },
  };
}

async function githubFetch(url) {
  const value = String(url);
  if (value.includes('/git/ref/heads/release/mel-hardware-v0.1.0')) {
    return new Response(JSON.stringify({ object: { sha: SHA } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (value.includes('/contents/src/router.js?ref=' + SHA)) {
    return new Response(JSON.stringify({
      type: 'file',
      size: 256,
      sha: 'router-blob-sha',
      content: Buffer.from('export default { fetch() {} }; // production router smoke').toString('base64'),
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ message: 'not found' }), {
    status: 404,
    headers: { 'content-type': 'application/json' },
  });
}

function env() {
  return {
    MELITURGOS_USER: 'owner',
    MELITURGOS_PASSWORD: 'owner-password',
    MEL_LAUNCH_BOOTSTRAP_TOKEN: TOKEN,
    MEL_DEPLOYED_GIT_BRANCH: BRANCH,
    MEL_DEPLOYED_GIT_SHA: SHA,
    MEL_GITHUB_FETCH: githubFetch,
    DB: db(),
  };
}

function smokeRequest(path, method = 'GET', init = {}) {
  return new Request('https://mel.test' + path, {
    method,
    headers: {
      'x-mel-release-smoke': '1',
      'x-mel-launch-bootstrap': TOKEN,
      ...(init.headers || {}),
    },
    body: init.body,
  });
}

test('MEL-REL-03 release token verifies self-code through the real Worker route', async () => {
  const response = await worker.fetch(smokeRequest('/api/gen2/code/self-check'), env(), {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.capability, 'code.read');
  assert.equal(body.branch, BRANCH);
  assert.equal(body.path, 'src/router.js');
  assert.ok(body.bytes > 20);
});

test('MEL-REL-03 release token verifies bounded persistent memory state read-only', async () => {
  const response = await worker.fetch(smokeRequest('/api/memory/status'), env(), {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.status, 'ONLINE');
  assert.equal(body.db_bound, true);
  assert.equal(body.memory_count, 3);
  assert.equal(body.archive_count, 3);
  assert.equal(body.conversation_count, 3);
  assert.equal(body.portable, true);
  assert.equal(body.provenance, true);
});

test('MEL-REL-03 release token verifies Professor and canonical browser runtime UI', async () => {
  const professor = await worker.fetch(smokeRequest('/professor'), env(), {});
  assert.equal(professor.status, 200);
  const html = await professor.text();
  assert.match(html, /Centre de contrôle/);
  assert.match(html, /data-panel="memory"/);
  assert.match(html, /data-panel="roadmap"/);

  const runtime = await worker.fetch(smokeRequest('/normal-runtime.js'), env(), {});
  assert.equal(runtime.status, 200);
  const js = await runtime.text();
  assert.match(js, /fetch\('\/api\/chat'/);
  assert.match(js, /toggleVoice/);
});

test('MEL-REL-03 release token runs only echo then exposes persisted observability metrics', async () => {
  const runtimeEnv = env();
  const echo = await worker.fetch(
    smokeRequest('/api/gen2/capabilities/execute', 'POST', {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id:'echo', input:{ value:'release-observability-smoke' } }),
    }),
    runtimeEnv,
    {},
  );
  assert.equal(echo.status, 200);
  const echoBody = await echo.json();
  assert.equal(echoBody.ok, true);
  assert.equal(echoBody.capability, 'echo');
  assert.equal(echoBody.result.value, 'release-observability-smoke');

  const readiness = await worker.fetch(smokeRequest('/api/gen2/readiness'), runtimeEnv, {});
  assert.equal(readiness.status, 200);
  const body = await readiness.json();
  assert.equal(body.ok, true);
  assert.equal(body.observability.query_ok, true);
  assert.ok(body.observability.metrics.capability_events >= 1);
  assert.ok(body.observability.metrics.succeeded >= 1);
  assert.ok(body.dashboard.components.some(row => row.id === 'runtime_observability'));
});

test('MEL-REL-03 release token cannot use the generic capability route for anything except echo', async () => {
  const response = await worker.fetch(
    smokeRequest('/api/gen2/capabilities/execute', 'POST', {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id:'conversation.archive', input:{ conversationId:'x' } }),
    }),
    env(),
    {},
  );
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.code, 'RELEASE_SMOKE_CAPABILITY_DENIED');
  assert.deepEqual(body.allowed_capabilities, ['echo']);
});

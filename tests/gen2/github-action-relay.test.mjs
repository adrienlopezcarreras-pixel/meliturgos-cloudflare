import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { sqliteD1 } from '../helpers/sqlite-d1.mjs';
import { CapabilityBus } from '../../src/capabilities/capability-bus.js';
import { registerPlatformControlCapabilities } from '../../src/capabilities/platform-control-capabilities.js';
import { D1GitHubActionRelayStore } from '../../src/platform/github-action-relay.js';
import { githubActionRelayApi } from '../../src/api/github-action-relay-api.js';
import { classifyHttpAuthSurface } from '../../src/security/http-auth-policy.js';

const TOKEN = 'r'.repeat(64);
const WORKFLOW = 'gen2-36-provider-write-smoke.yml';

function approved(id) {
  return {
    owner: 'adrien',
    permissions: [],
    requestId: 'github-relay-test',
    approvedCapabilities: [id],
  };
}

test('GitHub relay persists heartbeat, queues, atomically claims and completes one dispatch', async () => {
  const db = sqliteD1();
  try {
    const store = new D1GitHubActionRelayStore(db);
    let health = await store.health();
    assert.equal(health.online, false);

    health = await store.heartbeat({ metadata: { run_id: 12 } });
    assert.equal(health.online, true);
    assert.equal(health.metadata.run_id, 12);

    const queued = await store.enqueue({
      workflow: WORKFLOW,
      ref: 'main',
      inputs: { smoke: true },
    });
    assert.match(queued.id, /^gh-relay-/);
    assert.equal(queued.status, 'QUEUED');

    const claimed = await store.claim();
    assert.equal(claimed.id, queued.id);
    assert.equal(claimed.status, 'CLAIMED');
    assert.equal(await store.claim(), null);

    const completed = await store.complete(queued.id, {
      status: 'DISPATCHED',
      result: { accepted: true, http_status: 204 },
    });
    assert.equal(completed.status, 'DISPATCHED');
    assert.equal(completed.result.http_status, 204);
  } finally {
    db.close();
  }
});

test('GitHub workflow control falls back to the live D1 Actions relay without a persistent GitHub token', async () => {
  const db = sqliteD1();
  try {
    const store = new D1GitHubActionRelayStore(db);
    await store.heartbeat({ metadata: { run_id: 44 } });

    let networkCalls = 0;
    const bus = new CapabilityBus();
    registerPlatformControlCapabilities(bus, {
      env: {
        DB: db,
        MEL_GITHUB_REPOSITORY: 'owner/repo',
        MEL_GITHUB_WRITABLE_WORKFLOWS: WORKFLOW,
      },
      fetchImpl: async () => {
        networkCalls += 1;
        throw new Error('DIRECT_GITHUB_NETWORK_MUST_NOT_BE_USED');
      },
    });

    const health = await bus.refreshHealth('github.actions.workflow.dispatch');
    assert.equal(health.health, 'HEALTHY');

    const result = await bus.execute('github.actions.workflow.dispatch', {
      workflow: WORKFLOW,
      ref: 'main',
      inputs: { smoke: true },
    }, approved('github.actions.workflow.dispatch'));

    assert.equal(result.accepted, true);
    assert.equal(result.transport, 'd1-github-actions-relay');
    assert.equal(result.status, 'QUEUED');
    assert.match(result.relay_job_id, /^gh-relay-/);
    assert.equal(result.workflow_run_id, 0);
    assert.equal(networkCalls, 0);

    const status = await bus.execute('github.actions.workflow.dispatch.status', {
      job_id: result.relay_job_id,
    }, { owner: 'adrien', permissions: [], requestId: 'relay-status' });
    assert.equal(status.status, 'QUEUED');
    assert.equal(status.workflow, WORKFLOW);
  } finally {
    db.close();
  }
});

test('GitHub relay capability refuses to queue while no relay consumer heartbeat is live', async () => {
  const db = sqliteD1();
  try {
    const bus = new CapabilityBus();
    registerPlatformControlCapabilities(bus, {
      env: {
        DB: db,
        MEL_GITHUB_REPOSITORY: 'owner/repo',
        MEL_GITHUB_WRITABLE_WORKFLOWS: WORKFLOW,
      },
      fetchImpl: async () => new Response('{}', { status: 200 }),
    });

    const health = await bus.refreshHealth('github.actions.workflow.dispatch');
    assert.equal(health.health, 'DEGRADED');

    await assert.rejects(
      () => bus.execute('github.actions.workflow.dispatch', {
        workflow: WORKFLOW,
        ref: 'main',
      }, approved('github.actions.workflow.dispatch')),
      error => error?.code === 'GITHUB_ACTION_RELAY_OFFLINE',
    );
  } finally {
    db.close();
  }
});

test('internal GitHub relay API accepts durable Dev Bridge auth and rejects unrelated bearer auth', async () => {
  const db = sqliteD1();
  try {
    const env = { DB: db, MEL_DEV_BRIDGE_TOKEN: TOKEN };
    const unauthorized = await githubActionRelayApi(
      new Request('https://mel.test/api/internal/github-action-relay/heartbeat', {
        method: 'POST',
        headers: { authorization: 'Bearer owner-password', 'content-type': 'application/json' },
        body: '{}',
      }),
      env,
    );
    assert.equal(unauthorized.status, 401);

    const heartbeat = await githubActionRelayApi(
      new Request('https://mel.test/api/internal/github-action-relay/heartbeat', {
        method: 'POST',
        headers: { authorization: 'Bearer '+TOKEN, 'content-type': 'application/json' },
        body: JSON.stringify({ run_id: 91, repository: 'owner/repo' }),
      }),
      env,
    );
    assert.equal(heartbeat.status, 200);
    assert.equal((await heartbeat.json()).health.online, true);

    const store = new D1GitHubActionRelayStore(db);
    const queued = await store.enqueue({ workflow: WORKFLOW, ref: 'main' });

    const claim = await githubActionRelayApi(
      new Request('https://mel.test/api/internal/github-action-relay/claim', {
        method: 'POST',
        headers: { authorization: 'Bearer '+TOKEN, 'content-type': 'application/json' },
        body: '{}',
      }),
      env,
    );
    const claimed = await claim.json();
    assert.equal(claimed.job.id, queued.id);
    assert.equal(claimed.job.status, 'CLAIMED');

    const result = await githubActionRelayApi(
      new Request('https://mel.test/api/internal/github-action-relay/result', {
        method: 'POST',
        headers: { authorization: 'Bearer '+TOKEN, 'content-type': 'application/json' },
        body: JSON.stringify({
          job_id: queued.id,
          status: 'DISPATCHED',
          result: { accepted: true, http_status: 204 },
        }),
      }),
      env,
    );
    assert.equal(result.status, 200);
    assert.equal((await result.json()).job.status, 'DISPATCHED');
  } finally {
    db.close();
  }
});




test('relay workflow uses GitHub Actions OIDC and no Cloudflare/Dev Bridge transport credential', async () => {
  const source = await readFile(new URL('../../.github/workflows/github-action-relay.yml', import.meta.url), 'utf8');
  assert.match(source, /id-token:\s*write/);
  assert.match(source, /ACTIONS_ID_TOKEN_REQUEST_URL/);
  assert.match(source, /audience=meliturgos-worker/);
  assert.match(source, /MEL_GITHUB_OIDC_TOKEN/);
  assert.doesNotMatch(source, /CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(source, /CLOUDFLARE_ACCOUNT_ID/);
  assert.doesNotMatch(source, /MEL_DEV_BRIDGE_TOKEN:\s*\$\{\{ secrets\.MEL_DEV_BRIDGE_TOKEN \}\}/);
  assert.doesNotMatch(source, /MEL_R2_BUCKET/);
});


test('router bypasses API version auth for the scoped GitHub relay endpoint', async () => {
  const source = await readFile(new URL('../../src/router.js', import.meta.url), 'utf8');
  const relayIndex = source.indexOf("rawUrl.pathname.startsWith('/api/internal/github-action-relay/')");
  const versionIndex = source.indexOf("const resolution = resolveApiVersionRequest(request, { handler: 'router' });");
  assert.ok(relayIndex >= 0);
  assert.ok(versionIndex > relayIndex);
});


test('HTTP auth policy delegates the scoped GitHub relay endpoint to its OIDC handler', () => {
  const policy = classifyHttpAuthSurface(
    new Request('https://mel.test/api/internal/github-action-relay/heartbeat', { method: 'POST' }),
  );
  assert.equal(policy.kind, 'DELEGATED_STRONG_AUTH');
});


test('relay heartbeat stores only sanitized bounded GitHub read snapshot metadata', async () => {
  const db=sqliteD1();
  try {
    const env={DB:db,MEL_DEV_BRIDGE_TOKEN:TOKEN};
    const heartbeat=await githubActionRelayApi(
      new Request('https://mel.test/api/internal/github-action-relay/heartbeat',{
        method:'POST',
        headers:{authorization:'Bearer '+TOKEN,'content-type':'application/json'},
        body:JSON.stringify({
          run_id:77,
          repository:'owner/repo',
          repository_metadata:{
            id:42,name:'repo',full_name:'owner/repo',private:true,archived:false,disabled:false,
            visibility:'private',default_branch:'main',pushed_at:'2026-10-01T07:00:00Z',updated_at:'2026-10-01T07:01:00Z',
            token:'must-not-persist',
          },
          actions_runs:Array.from({length:60},(_,i)=>({
            id:i+1,name:'ci',event:'push',status:'completed',conclusion:'success',head_branch:'main',
            head_sha:'a'.repeat(40),run_number:i+1,created_at:'2026-10-01T07:00:00Z',updated_at:'2026-10-01T07:01:00Z',
            html_url:'https://github.com/owner/repo/actions/runs/'+(i+1),secret:'must-not-persist',
          })),
          snapshot_at:'2026-10-01T07:02:00.000Z',
          arbitrary_secret:'must-not-persist',
        }),
      }),
      env,
    );
    assert.equal(heartbeat.status,200);
    const health=await new D1GitHubActionRelayStore(db).health();
    assert.equal(health.metadata.repository,'owner/repo');
    assert.equal(health.metadata.repository_metadata.full_name,'owner/repo');
    assert.equal(health.metadata.actions_runs.length,50);
    assert.equal(health.metadata.snapshot_at,'2026-10-01T07:02:00.000Z');
    const serialized=JSON.stringify(health.metadata);
    assert.equal(serialized.includes('must-not-persist'),false);
    assert.equal(serialized.includes('arbitrary_secret'),false);
  } finally {
    db.close();
  }
});

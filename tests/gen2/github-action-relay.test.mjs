import test from 'node:test';
import assert from 'node:assert/strict';

import { sqliteD1 } from '../helpers/sqlite-d1.mjs';
import { CapabilityBus } from '../../src/capabilities/capability-bus.js';
import { registerPlatformControlCapabilities } from '../../src/capabilities/platform-control-capabilities.js';
import { D1GitHubActionRelayStore } from '../../src/platform/github-action-relay.js';
import { R2GitHubActionRelayStore } from '../../src/platform/github-action-r2-relay.js';
import { githubActionRelayApi } from '../../src/api/github-action-relay-api.js';

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

function memoryR2() {
  const objects = new Map();
  return {
    objects,
    async put(key, value) {
      objects.set(String(key), String(value));
      return { key: String(key) };
    },
    async get(key) {
      const value = objects.get(String(key));
      if (value == null) return null;
      return {
        async text() { return value; },
        async json() { return JSON.parse(value); },
      };
    },
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

test('internal GitHub relay API requires its dedicated secret and never accepts owner auth as a substitute', async () => {
  const db = sqliteD1();
  try {
    const env = { DB: db, MEL_GITHUB_RELAY_TOKEN: TOKEN };
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
        headers: { 'x-mel-github-relay': TOKEN, 'content-type': 'application/json' },
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
        headers: { 'x-mel-github-relay': TOKEN, 'content-type': 'application/json' },
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
        headers: { 'x-mel-github-relay': TOKEN, 'content-type': 'application/json' },
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


test('GitHub workflow control prefers the live R2 relay and persists readable status', async () => {
  const bucket = memoryR2();
  const store = new R2GitHubActionRelayStore(bucket);
  await store.heartbeat({ metadata: { run_id: 77 } });

  const bus = new CapabilityBus();
  registerPlatformControlCapabilities(bus, {
    env: {
      MEDIA_BUCKET: bucket,
      MEL_GITHUB_REPOSITORY: 'owner/repo',
      MEL_GITHUB_WRITABLE_WORKFLOWS: WORKFLOW,
    },
    fetchImpl: async () => { throw new Error('DIRECT_GITHUB_NETWORK_MUST_NOT_BE_USED'); },
  });

  const health = await bus.refreshHealth('github.actions.workflow.dispatch');
  assert.equal(health.health, 'HEALTHY');

  const result = await bus.execute('github.actions.workflow.dispatch', {
    workflow: WORKFLOW,
    ref: 'main',
    inputs: { smoke: true },
  }, approved('github.actions.workflow.dispatch'));

  assert.equal(result.accepted, true);
  assert.equal(result.transport, 'r2-github-actions-relay');
  assert.equal(result.status, 'QUEUED');
  assert.match(result.relay_job_id, /^gh-relay-/);

  const status = await bus.execute('github.actions.workflow.dispatch.status', {
    job_id: result.relay_job_id,
  }, { owner: 'adrien', permissions: [], requestId: 'r2-relay-status' });
  assert.equal(status.status, 'QUEUED');
  assert.equal(status.workflow, WORKFLOW);
  assert.equal(status.inputs.smoke, true);
});

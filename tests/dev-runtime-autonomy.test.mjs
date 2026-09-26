import test from 'node:test';
import assert from 'node:assert/strict';
import { devRuntime } from '../src/dev/runtime-api.js';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { selectNextAutonomyItem } from '../src/evolution/autonomy-supervisor.js';

const env = { MELITURGOS_USER: 'test', MEL_DEV_BRIDGE_TOKEN: 'bridge-test' };
const auth = { authorization: 'Bearer bridge-test', 'content-type': 'application/json' };
const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
const TEST_ROADMAP = Object.freeze([
  { id: 'TEST-DEV-01', title: 'Synthetic dev autonomy 1', status: 'IN_PROGRESS', next: 'test', priority: 'P0' },
  { id: 'TEST-DEV-02', title: 'Synthetic dev autonomy 2', status: 'PLANNED', next: 'test', priority: 'P0' },
]);
const FIRST_AUTONOMY_ID = selectNextAutonomyItem({ roadmap: TEST_ROADMAP })?.id;

test('authorized dev bridge can create exactly one non-idle autonomy job', async () => {
  let response = await devRuntime(new Request('http://x/api/dev-bridge/autonomy/next', {
    method: 'POST', headers: auth, body: '{}',
  }), env, { repository, roadmap: TEST_ROADMAP });
  assert.equal(response.status, 200);
  const first = await response.json();
  assert.equal(first.ok, true);
  assert.equal(first.created, true);
  assert.equal(first.job.requested_by, 'mel-autonomy');
  assert.equal(first.job.optional_context.roadmap_id, FIRST_AUTONOMY_ID);

  response = await devRuntime(new Request('http://x/api/dev-bridge/autonomy/next', {
    method: 'POST', headers: auth, body: '{}',
  }), env, { repository, roadmap: TEST_ROADMAP });
  const second = await response.json();
  assert.equal(second.created, false);
  assert.equal(second.job.id, first.job.id);
  assert.notEqual(second.next?.id, FIRST_AUTONOMY_ID);
});

test('autonomy status exposes active work and the following safe roadmap target', async () => {
  const response = await devRuntime(new Request('http://x/api/professor/dev/autonomy/status', {
    method: 'GET', headers: { 'content-type': 'application/json' },
  }), env, { repository, roadmap: TEST_ROADMAP });
  assert.equal(response.status, 200);
  const state = await response.json();
  assert.equal(state.ok, true);
  assert.ok(Array.isArray(state.active_jobs));
  assert.ok(state.active_jobs.some((job) => job.requested_by === 'mel-autonomy'));
  assert.notEqual(state.next?.id, FIRST_AUTONOMY_ID);
});

test('autonomy endpoint remains protected by the bridge token', async () => {
  const response = await devRuntime(new Request('http://x/api/dev-bridge/autonomy/next', { method: 'POST', body: '{}' }), env, { repository, roadmap: TEST_ROADMAP });
  assert.equal(response.status, 401);
});

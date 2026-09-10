import test from 'node:test';
import assert from 'node:assert/strict';
import { devRuntime } from '../src/dev/runtime-api.js';

const env = { MELITURGOS_USER: 'test', MEL_DEV_BRIDGE_TOKEN: 'bridge-test' };
const auth = { authorization: 'Bearer bridge-test', 'content-type': 'application/json' };

test('authorized dev bridge can create exactly one non-idle autonomy job', async () => {
  let response = await devRuntime(new Request('http://x/api/dev-bridge/autonomy/next', {
    method: 'POST', headers: auth, body: '{}',
  }), env);
  assert.equal(response.status, 200);
  const first = await response.json();
  assert.equal(first.ok, true);
  assert.equal(first.created, true);
  assert.equal(first.job.requested_by, 'mel-autonomy');
  assert.equal(first.job.optional_context.roadmap_id, 'MEL-WORK-01');

  response = await devRuntime(new Request('http://x/api/dev-bridge/autonomy/next', {
    method: 'POST', headers: auth, body: '{}',
  }), env);
  const second = await response.json();
  assert.equal(second.created, false);
  assert.equal(second.job.id, first.job.id);
  assert.notEqual(second.next?.id, 'MEL-WORK-01');
});

test('autonomy status exposes active work and the following safe roadmap target', async () => {
  const response = await devRuntime(new Request('http://x/api/professor/dev/autonomy/status', {
    method: 'GET', headers: { 'content-type': 'application/json' },
  }), env);
  assert.equal(response.status, 200);
  const state = await response.json();
  assert.equal(state.ok, true);
  assert.ok(Array.isArray(state.active_jobs));
  assert.ok(state.active_jobs.some((job) => job.requested_by === 'mel-autonomy'));
  assert.notEqual(state.next?.id, 'MEL-WORK-01');
});

test('autonomy endpoint remains protected by the bridge token', async () => {
  const response = await devRuntime(new Request('http://x/api/dev-bridge/autonomy/next', { method: 'POST', body: '{}' }), env);
  assert.equal(response.status, 401);
});

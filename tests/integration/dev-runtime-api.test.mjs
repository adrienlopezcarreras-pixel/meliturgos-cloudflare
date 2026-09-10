import test from 'node:test';
import assert from 'node:assert/strict';
import { devRuntime } from '../../src/dev/runtime-api.js';

const env = { MELITURGOS_USER: 'test', MEL_DEV_BRIDGE_TOKEN: 'bridge-test' };
const auth = { authorization: 'Bearer bridge-test', 'content-type': 'application/json' };

test('Professor job lifecycle reaches explicit approval through bridge API', async () => {
  let r = await devRuntime(new Request('http://x/api/professor/dev/jobs', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: 'safe fixture change' })
  }), env);
  const j = await r.json();
  assert.equal(r.status, 201);
  r = await devRuntime(new Request('http://x/api/dev-bridge/claim', { method: 'POST', headers: auth, body: '{}' }), env);
  const c = await r.json();
  assert.equal(c.job_id, j.job_id);
  assert.ok(c.plan_json.steps.includes('mentor.propose'));
  assert.ok(c.plan_json.steps.includes('mentor.repair'));
  r = await devRuntime(new Request('http://x/api/dev-bridge/result', {
    method: 'POST', headers: auth, body: JSON.stringify({ job_id: j.job_id, status: 'READY_FOR_REVIEW', tests: [{ passed: true }], diff_summary: 'fixture' })
  }), env);
  assert.equal((await r.json()).status, 'READY_FOR_REVIEW');
  r = await devRuntime(new Request(`http://x/api/professor/dev/jobs/${j.job_id}/approve`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  }), env);
  assert.equal((await r.json()).status, 'APPROVED');
});

test('bridge mentor endpoint asks zero-cost CODE models and returns full-file changes', async () => {
  const mentorEnv = {
    MELITURGOS_USER: 'test',
    MEL_DEV_BRIDGE_TOKEN: 'bridge-test',
    AI: {
      async run(model) {
        return {
          response: JSON.stringify({
            summary: `Proposal from ${model}`,
            changes: [{ path: 'src/example.js', content: 'export const autonomous = true;\n', reason: 'Make the fixture autonomous' }],
            tests: ['test:smoke'],
            confidence: 0.88,
            lessons: ['Test before review.'],
            risks: [],
          })
        };
      }
    }
  };

  let response = await devRuntime(new Request('http://x/api/professor/dev/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ goal: 'Add autonomous fixture behavior' })
  }), mentorEnv);
  const job = await response.json();
  assert.equal(response.status, 201);

  response = await devRuntime(new Request('http://x/api/dev-bridge/claim', {
    method: 'POST', headers: auth, body: '{}'
  }), mentorEnv);
  assert.equal(response.status, 200);

  response = await devRuntime(new Request('http://x/api/dev-bridge/mentor', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      job_id: job.job_id,
      inspected_files: [{ path: 'src/example.js', content: 'export const autonomous = false;\n' }]
    })
  }), mentorEnv);
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(data.ok, true);
  assert.equal(data.proposal.changes[0].path, 'src/example.js');
  assert.equal(data.proposal.changes[0].content, 'export const autonomous = true;\n');
  assert.deepEqual(data.proposal.tests, ['test:smoke']);
  assert.ok(data.council.providers_attempted.length >= 2);
  assert.equal(data.policy, 'ZERO_ADDED_COST_FAIL_CLOSED');
});

test('bridge rejects missing token', async () => {
  const r = await devRuntime(new Request('http://x/api/dev-bridge/heartbeat', { method: 'POST' }), env);
  assert.equal(r.status, 401);
});

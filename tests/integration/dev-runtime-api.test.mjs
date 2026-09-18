import test from 'node:test';
import assert from 'node:assert/strict';
import { continueAfterVerifiedCompletion, devRuntime, hasVerifiedCompletionForJob } from '../../src/dev/runtime-api.js';
import { D1DevJobRepository } from '../../src/dev/d1-dev-job-repository.js';

const env = { MELITURGOS_USER: 'test', MEL_DEV_BRIDGE_TOKEN: 'bridge-test' };
const auth = { authorization: 'Bearer bridge-test', 'content-type': 'application/json' };

function createRuntimeHarness() {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  return {
    repository,
    call(request) { return devRuntime(request, env, { repository }); },
  };
}

test('Professor job lifecycle reaches explicit approval through bridge API', async () => {
  const runtime = createRuntimeHarness();
  let r = await runtime.call(new Request('http://x/api/professor/dev/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: 'safe fixture change' }) }));
  const j = await r.json();
  assert.equal(r.status, 201);
  r = await runtime.call(new Request('http://x/api/dev-bridge/claim', { method: 'POST', headers: auth, body: '{}' }));
  const c = await r.json();
  assert.equal(c.job_id, j.job_id);
  r = await runtime.call(new Request('http://x/api/dev-bridge/result', { method: 'POST', headers: auth, body: JSON.stringify({ job_id: j.job_id, status: 'READY_FOR_REVIEW', tests: [{ passed: true }], diff_summary: 'fixture' }) }));
  assert.equal((await r.json()).status, 'READY_FOR_REVIEW');
  r = await runtime.call(new Request(`http://x/api/professor/dev/jobs/${j.job_id}/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));
  assert.equal((await r.json()).status, 'APPROVED');
});

test('failed tests persist REPAIR_REQUIRED and only a passing retest can restore READY_FOR_REVIEW', async () => {
  const runtime = createRuntimeHarness();
  let r = await runtime.call(new Request('http://x/api/professor/dev/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: 'repair fixture change' }) }));
  const j = await r.json();
  r = await runtime.call(new Request('http://x/api/dev-bridge/result', { method: 'POST', headers: auth, body: JSON.stringify({ job_id: j.job_id, status: 'READY_FOR_REVIEW', tests: [{ name: 'targeted', passed: false, exit_code: 1 }], diff_summary: 'candidate needs repair' }) }));
  const failed = await r.json();
  assert.equal(failed.status, 'REPAIR_REQUIRED');
  assert.equal(failed.result_json.dev_bridge.needs_repair, true);
  await assert.rejects(() => runtime.call(new Request(`http://x/api/professor/dev/jobs/${j.job_id}/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })), (error) => error?.code === 'JOB_NOT_READY');
  r = await runtime.call(new Request('http://x/api/dev-bridge/result', { method: 'POST', headers: auth, body: JSON.stringify({ job_id: j.job_id, status: 'READY_FOR_REVIEW', tests: [{ name: 'targeted', passed: true, exit_code: 0 }], diff_summary: 'candidate repaired and retested' }) }));
  const repaired = await r.json();
  assert.equal(repaired.status, 'READY_FOR_REVIEW');
  assert.equal(repaired.result_json.dev_bridge.needs_repair, false);
  r = await runtime.call(new Request(`http://x/api/professor/dev/jobs/${j.job_id}/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));
  assert.equal((await r.json()).status, 'APPROVED');
});

test('verified completion triggers exactly one bounded autonomy continuation for the matching job', async () => {
  const reconciliation = {
    ok: true,
    completed: [{
      job_id: 'finished-job',
      candidate_sha: 'b'.repeat(40),
      ci_run_id: 12345,
    }],
    rejected: [],
  };
  assert.equal(hasVerifiedCompletionForJob(reconciliation, 'finished-job'), true);
  assert.equal(hasVerifiedCompletionForJob(reconciliation, 'other-job'), false);

  let ticks = 0;
  const runTick = async (_env, options) => {
    ticks += 1;
    assert.ok(options.repository);
    return {
      ok: true,
      status: 'ACTIVE',
      advanced: true,
      job: { id: 'next-job', status: 'ACTIVE', roadmap_id: 'GEN2-18' },
    };
  };
  const repository = { list: async () => [] };
  const continued = await continueAfterVerifiedCompletion({
    env: {},
    repository,
    reconciliation,
    jobId: 'finished-job',
    runTick,
    fetchImpl: async () => new Response('', { status: 404 }),
  });
  assert.equal(ticks, 1);
  assert.equal(continued.attempted, true);
  assert.equal(continued.ok, true);
  assert.equal(continued.advanced, true);
  assert.equal(continued.job.id, 'next-job');

  const skipped = await continueAfterVerifiedCompletion({
    env: {},
    repository,
    reconciliation,
    jobId: 'other-job',
    runTick,
  });
  assert.equal(ticks, 1, 'non-verified jobs must not trigger another tick');
  assert.equal(skipped.attempted, false);
  assert.equal(skipped.reason, 'NO_VERIFIED_COMPLETION');
});

test('completion without exact SHA/CI proof cannot auto-continue', async () => {
  let ticks = 0;
  const runTick = async () => { ticks += 1; return { ok: true }; };
  const bad = { completed: [{ job_id: 'finished-job', candidate_sha: 'not-a-sha', ci_run_id: 0 }] };
  const result = await continueAfterVerifiedCompletion({
    env: {},
    repository: {},
    reconciliation: bad,
    jobId: 'finished-job',
    runTick,
  });
  assert.equal(ticks, 0);
  assert.equal(result.attempted, false);
});

test('bridge rejects missing token', async () => {
  const r = await devRuntime(new Request('http://x/api/dev-bridge/heartbeat', { method: 'POST' }));
  assert.equal(r.status, 401);
});


test('runtime without D1 fails closed instead of simulating persistent jobs', async () => {
  const response = await devRuntime(
    new Request('http://x/api/professor/dev/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: 'must not vanish' }),
    }),
    env,
  );
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, 'DEV_RUNTIME_DB_REQUIRED');
});

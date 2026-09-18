import test from 'node:test';
import assert from 'node:assert/strict';
import { devRuntime } from '../src/dev/runtime-api.js';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';

const TEST_SHA = '1111111111111111111111111111111111111111';
const REQUIRED_ROLES = ['ARCHITECTURE_REUSE', 'SECURITY_GOVERNANCE', 'TESTS_EVIDENCE', 'PRODUCT_INTEGRATION'];

function envWithAi() {
  const calls = [];
  return {
    env: {
      MELITURGOS_USER: 'test',
      MEL_DEV_BRIDGE_TOKEN: 'bridge-test',
      AI: {
        async run(model, input) {
          calls.push({ model, input });
          return { response: `Independent bounded review from ${model}` };
        },
      },
    },
    calls,
  };
}
const auth = { authorization: 'Bearer bridge-test', 'content-type': 'application/json' };
const repository = new D1DevJobRepository(null, { memoryStore: new Map() });

async function createJob(env, goal = 'Prove real runtime Teacher round-trip') {
  const response = await devRuntime(new Request('http://x/api/professor/dev/jobs', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal, optional_context: { target_sha: TEST_SHA } }),
  }), env, { repository });
  assert.equal(response.status, 201);
  return response.json();
}

test('runtime generates live zero-added-cost four-role Council evidence and MEL synthesis before creating a SHA-bound Teacher request', async () => {
  const { env, calls } = envWithAi();
  const job = await createJob(env);
  let response = await devRuntime(new Request('http://x/api/dev-bridge/council', {
    method: 'POST', headers: auth, body: JSON.stringify({ job_id: job.id, minResponses: 2 }),
  }), env, { repository });
  assert.equal(response.status, 200);
  const council = await response.json();
  assert.equal(council.ok, true);
  assert.equal(council.status, 'COUNCIL_COMPLETE');
  assert.equal(council.preflight.stage, 'AI_STATE_OF_PLAY_COMPLETE');
  assert.equal(council.preflight.council.context.target_sha, TEST_SHA);
  assert.equal(council.preflight.council.development_allowed, false);
  assert.equal(council.preflight.council.all_required_roles_satisfied, true);
  assert.deepEqual(new Set(council.preflight.council.required_roles_succeeded), new Set(REQUIRED_ROLES));
  assert.equal(council.preflight.council.synthesis.status, 'COMPLETE');
  assert.ok(council.preflight.council.synthesis.text.length > 0);
  assert.ok(calls.length >= 5);

  response = await devRuntime(new Request('http://x/api/dev-bridge/teacher/request', {
    method: 'POST', headers: auth, body: JSON.stringify({
      job_id: job.id,
      inspection: { status: 'COMPLETE', evidence: [{ path: 'src/dev/runtime-api.js', finding: 'bounded runtime API inspected' }] },
      spec: { candidate_only: true, goal: 'continue safely' },
      candidate: { branch: 'candidate/mel-clean-autonomy', sha: TEST_SHA },
      tests: [{ name: 'runtime-gate', passed: true }],
    }),
  }), env, { repository });
  assert.equal(response.status, 200);
  const teacher = await response.json();
  assert.equal(teacher.ok, true);
  assert.equal(teacher.status, 'WAITING_TEACHER');
  assert.equal(teacher.request.type, 'MEL_TEACHER_REVIEW_REQUEST');
  assert.equal(teacher.request.version, 2);
  assert.equal(teacher.request.target_sha, TEST_SHA);
  assert.equal(teacher.request.provenance.producer, 'MEL');
  assert.equal(teacher.request.provenance.job_id, job.id);
  assert.equal(teacher.request.provenance.contract, 'teacher-review/v2');
  assert.equal(teacher.teacher_pending_visible_in_d1, true);
  assert.ok(teacher.teacher_transport, 'Teacher handoff must be attempted in the same request');
});

test('matching SHA-bound runtime Teacher reply resumes candidate development but cannot approve production commit', async () => {
  const { env } = envWithAi();
  const job = await createJob(env, 'Teacher separation proof');
  await devRuntime(new Request('http://x/api/dev-bridge/council', {
    method: 'POST', headers: auth, body: JSON.stringify({ job_id: job.id }),
  }), env, { repository });
  const requestResponse = await devRuntime(new Request('http://x/api/dev-bridge/teacher/request', {
    method: 'POST', headers: auth, body: JSON.stringify({
      job_id: job.id,
      inspection: { status: 'COMPLETE', evidence: [{ path: 'src/dev/runtime-api.js' }] },
      spec: { candidate_only: true },
      candidate: { branch: 'candidate/mel-clean-autonomy', sha: TEST_SHA },
    }),
  }), env, { repository });
  const teacher = await requestResponse.json();

  const response = await devRuntime(new Request('http://x/api/dev-bridge/teacher/reply', {
    method: 'POST', headers: auth, body: JSON.stringify({
      request_id: teacher.request.request_id,
      target_sha: TEST_SHA,
      verdict: 'APPROVE_PLAN',
      feedback: 'Continue candidate work.',
    }),
  }), env, { repository });
  const applied = await response.json();
  assert.equal(applied.status, 'TEACHER_APPROVED');
  assert.equal(applied.review.development_allowed, true);
  assert.equal(applied.review.target_sha, TEST_SHA);

  await assert.rejects(
    () => devRuntime(new Request(`http://x/api/professor/dev/jobs/${job.id}/approve`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    }), env, { repository }),
    (error) => error?.code === 'JOB_NOT_READY',
  );
});

test('Teacher request cannot be created without a completed live Council', async () => {
  const { env } = envWithAi();
  const job = await createJob(env, 'Council required');
  await assert.rejects(
    () => devRuntime(new Request('http://x/api/dev-bridge/teacher/request', {
      method: 'POST', headers: auth, body: JSON.stringify({
        job_id: job.id,
        inspection: { status: 'COMPLETE', evidence: [{ path: 'src/dev/runtime-api.js' }] },
      }),
    }), env, { repository }),
    (error) => error?.code === 'AI_PREFLIGHT_REQUIRED',
  );
});

test('READY_FOR_REVIEW is received and reconciliation is attempted in the same bridge request', async () => {
  const { env } = envWithAi();
  env.MEL_TEACHER_COMPLETIONS_URL = 'data:text/plain,';
  const job = await createJob(env, 'Immediate READY_FOR_REVIEW processing');

  const response = await devRuntime(new Request('http://x/api/dev-bridge/result', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      job_id: job.id,
      status: 'READY_FOR_REVIEW',
      candidate_branch: 'candidate/mel-clean-autonomy',
      diff_summary: 'bounded candidate change ready for correlated CI review',
      tests: [{ name: 'targeted', passed: true }],
    }),
  }), env, { repository });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'READY_FOR_REVIEW');
  assert.equal(body.result_json.dev_bridge.status, 'READY_FOR_REVIEW');
  assert.ok(body.result_json.dev_bridge.received_at);
  assert.equal(body.immediate_completion_reconciliation.attempted, true);
  assert.equal(body.immediate_completion_reconciliation.ok, true);
  assert.deepEqual(body.immediate_completion_reconciliation.completed, []);
  assert.deepEqual(body.immediate_completion_reconciliation.rejected, []);
});

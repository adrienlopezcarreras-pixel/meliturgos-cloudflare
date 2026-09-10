import test from 'node:test';
import assert from 'node:assert/strict';
import { devRuntime } from '../src/dev/runtime-api.js';

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

async function createJob(env, goal = 'Prove real runtime Teacher round-trip') {
  const response = await devRuntime(new Request('http://x/api/professor/dev/jobs', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal }),
  }), env);
  assert.equal(response.status, 201);
  return response.json();
}

test('runtime generates live zero-added-cost Council evidence before creating a Teacher request', async () => {
  const { env, calls } = envWithAi();
  const job = await createJob(env);
  let response = await devRuntime(new Request('http://x/api/dev-bridge/council', {
    method: 'POST', headers: auth, body: JSON.stringify({ job_id: job.id, minResponses: 2 }),
  }), env);
  assert.equal(response.status, 200);
  const council = await response.json();
  assert.equal(council.ok, true);
  assert.equal(council.status, 'COUNCIL_COMPLETE');
  assert.equal(council.preflight.stage, 'AI_STATE_OF_PLAY_COMPLETE');
  assert.ok(council.preflight.council.responses.length >= 2);
  assert.ok(calls.length >= 2);

  response = await devRuntime(new Request('http://x/api/dev-bridge/teacher/request', {
    method: 'POST', headers: auth, body: JSON.stringify({
      job_id: job.id,
      inspection: { status: 'COMPLETE', evidence: [{ path: 'src/dev/runtime-api.js', finding: 'bounded runtime API inspected' }] },
      spec: { candidate_only: true, goal: 'continue safely' },
      candidate: { branch: 'candidate/augmentio-core', sha: 'abc1234' },
      tests: [{ name: 'runtime-gate', passed: true }],
    }),
  }), env);
  assert.equal(response.status, 200);
  const teacher = await response.json();
  assert.equal(teacher.ok, true);
  assert.equal(teacher.status, 'WAITING_TEACHER');
  assert.equal(teacher.request.type, 'MEL_TEACHER_REVIEW_REQUEST');
  assert.equal(teacher.request.provenance.producer, 'MEL');
  assert.equal(teacher.request.provenance.job_id, job.id);
  assert.equal(teacher.request.provenance.contract, 'teacher-review/v1');
});

test('matching runtime Teacher reply resumes candidate development but cannot approve production commit', async () => {
  const { env } = envWithAi();
  const job = await createJob(env, 'Teacher separation proof');
  await devRuntime(new Request('http://x/api/dev-bridge/council', {
    method: 'POST', headers: auth, body: JSON.stringify({ job_id: job.id }),
  }), env);
  const requestResponse = await devRuntime(new Request('http://x/api/dev-bridge/teacher/request', {
    method: 'POST', headers: auth, body: JSON.stringify({
      job_id: job.id,
      inspection: { status: 'COMPLETE', evidence: [{ path: 'src/dev/runtime-api.js' }] },
      spec: { candidate_only: true },
    }),
  }), env);
  const teacher = await requestResponse.json();

  const response = await devRuntime(new Request('http://x/api/dev-bridge/teacher/reply', {
    method: 'POST', headers: auth, body: JSON.stringify({
      request_id: teacher.request.request_id,
      verdict: 'APPROVE_PLAN',
      feedback: 'Continue candidate work.',
    }),
  }), env);
  const applied = await response.json();
  assert.equal(applied.status, 'TEACHER_APPROVED');
  assert.equal(applied.review.development_allowed, true);

  await assert.rejects(
    () => devRuntime(new Request(`http://x/api/professor/dev/jobs/${job.id}/approve`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    }), env),
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
    }), env),
    (error) => error?.code === 'AI_PREFLIGHT_REQUIRED',
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { runAutonomyRuntimeTick } from '../src/evolution/autonomy-runtime.js';

function runtimeFixture() {
  let replies = '';
  const aiCalls = [];
  const fetchCalls = [];
  const fetchImpl = async (url) => {
    const target = String(url);
    fetchCalls.push(target);
    if (target.includes('teacher-bridge/replies.jsonl')) return new Response(replies, { status: 200 });
    if (target.startsWith('https://api.github.com/')) return new Response('rate-limited fixture', { status: 403 });
    if (target.startsWith('https://raw.githubusercontent.com/')) return new Response('export const fixture = true;\n// candidate technical source\n', { status: 200, headers: { etag: 'fixture-etag' } });
    return new Response('not found', { status: 404 });
  };
  const env = {
    MELITURGOS_USER: 'test',
    MEL_GITHUB_REPOSITORY: 'owner/repo',
    MEL_TEACHER_BRANCH: 'candidate/augmentio-core',
    AI: {
      async run(model) {
        aiCalls.push(model);
        return { response: `Independent state-of-play from ${model}` };
      },
    },
  };
  return { env, aiCalls, fetchCalls, fetchImpl, setReplies(value) { replies = value; } };
}

test('cloud autonomy heartbeat creates P0 work, runs live Council, inspects candidate code, and emits a runtime Teacher request', async () => {
  const fixture = runtimeFixture();
  const first = await runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl });
  assert.equal(first.ok, true);
  assert.equal(first.ensured.created, true);
  assert.equal(first.job.roadmap_id, 'MEL-WORK-01');
  assert.equal(first.job.status, 'WAITING_TEACHER');
  assert.equal(first.teacher.status, 'WAITING_TEACHER');
  assert.ok(first.teacher.request_id);
  assert.ok(fixture.aiCalls.length >= 2, 'live Council must call at least two configured zero-cost models');
  assert.ok(fixture.fetchCalls.some((url) => url.includes('raw.githubusercontent.com')), 'candidate code must be inspected');

  const second = await runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl });
  assert.equal(second.ensured.created, false);
  assert.equal(second.job.id, first.job.id);
  assert.equal(second.teacher, null);
  assert.equal(fixture.aiCalls.length, fixture.aiCalls.length, 'pending Teacher work is not regenerated');
});

test('cloud autonomy heartbeat consumes the matching canonical GitHub Teacher reply and resumes the same job', async () => {
  const fixture = runtimeFixture();
  const first = await runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl });
  fixture.setReplies(JSON.stringify({
    kind: 'TEACHER_REPLY',
    request_id: first.teacher.request_id,
    verdict: 'APPROVE_PLAN',
    feedback: 'Proceed with the smallest candidate-only implementation and tests.',
  }));
  const resumed = await runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl });
  assert.equal(resumed.reconciliation.applied.length, 1);
  assert.equal(resumed.reconciliation.applied[0].request_id, first.teacher.request_id);
  assert.equal(resumed.job.id, first.job.id);
  assert.equal(resumed.job.status, 'TEACHER_APPROVED');
});

test('cloud autonomy heartbeat rejects a non-candidate Teacher branch fail-closed', async () => {
  const fixture = runtimeFixture();
  fixture.env.MEL_TEACHER_BRANCH = 'main';
  await assert.rejects(
    () => runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl }),
    (error) => error?.code === 'AUTONOMY_BRANCH_NOT_CANDIDATE' || error?.code === 'TEACHER_BRANCH_NOT_CANDIDATE',
  );
});

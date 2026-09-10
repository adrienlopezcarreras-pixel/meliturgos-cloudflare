import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { runAutonomyRuntimeTick } from '../src/evolution/autonomy-runtime.js';

function runtimeFixture() {
  let replies = '';
  let completions = '';
  const aiCalls = [];
  const fetchCalls = [];
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const fetchImpl = async (url) => {
    const target = String(url);
    fetchCalls.push(target);
    if (target.includes('teacher-bridge/replies.jsonl')) return new Response(replies, { status: 200 });
    if (target.includes('teacher-bridge/completions.jsonl')) return new Response(completions, { status: 200 });
    if (target.includes('/actions/runs/4242')) {
      return Response.json({
        name: 'full-candidate-ci',
        head_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        head_branch: 'candidate/augmentio-core',
        status: 'completed',
        conclusion: 'success',
      });
    }
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
  return {
    env,
    repository,
    aiCalls,
    fetchCalls,
    fetchImpl,
    setReplies(value) { replies = value; },
    setCompletions(value) { completions = value; },
  };
}

test('cloud autonomy heartbeat creates P0 work, runs live Council, inspects candidate code, and emits a runtime Teacher request', async () => {
  const fixture = runtimeFixture();
  const first = await runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl, repository: fixture.repository });
  assert.equal(first.ok, true);
  assert.equal(first.ensured.created, true);
  assert.equal(first.job.roadmap_id, 'MEL-WORK-01');
  assert.equal(first.job.status, 'WAITING_TEACHER');
  assert.equal(first.teacher.status, 'WAITING_TEACHER');
  assert.ok(first.teacher.request_id);
  assert.ok(fixture.aiCalls.length >= 2, 'live Council must call at least two configured zero-cost models');
  assert.ok(fixture.fetchCalls.some((url) => url.includes('raw.githubusercontent.com')), 'candidate code must be inspected');

  const aiCallCount = fixture.aiCalls.length;
  const second = await runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl, repository: fixture.repository });
  assert.equal(second.ensured.created, false);
  assert.equal(second.job.id, first.job.id);
  assert.equal(second.teacher, null);
  assert.equal(fixture.aiCalls.length, aiCallCount, 'pending Teacher work is not regenerated');
});

test('cloud autonomy heartbeat consumes the matching canonical GitHub Teacher reply and resumes the same job', async () => {
  const fixture = runtimeFixture();
  const first = await runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl, repository: fixture.repository });
  assert.ok(first.teacher?.request_id);
  fixture.setReplies(JSON.stringify({
    kind: 'TEACHER_REPLY',
    request_id: first.teacher.request_id,
    verdict: 'APPROVE_PLAN',
    feedback: 'Proceed with the smallest candidate-only implementation and tests.',
  }));
  const resumed = await runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl, repository: fixture.repository });
  assert.equal(resumed.reconciliation.applied.length, 1);
  assert.equal(resumed.reconciliation.applied[0].request_id, first.teacher.request_id);
  assert.equal(resumed.job.id, first.job.id);
  assert.equal(resumed.job.status, 'TEACHER_APPROVED');
});

test('verified completion closes the approved job and releases the next roadmap job in the same heartbeat', async () => {
  const fixture = runtimeFixture();
  const first = await runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl, repository: fixture.repository });
  const requestId = first.teacher.request_id;

  fixture.setReplies(JSON.stringify({
    kind: 'TEACHER_REPLY',
    request_id: requestId,
    verdict: 'APPROVE_PLAN',
    feedback: 'Proceed on candidate only.',
  }));
  const approved = await runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl, repository: fixture.repository });
  assert.equal(approved.job.id, first.job.id);
  assert.equal(approved.job.status, 'TEACHER_APPROVED');

  fixture.setCompletions(JSON.stringify({
    kind: 'MEL_WORK_COMPLETION',
    status: 'COMPLETED',
    job_id: first.job.id,
    request_id: requestId,
    candidate_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    candidate_branch: 'candidate/augmentio-core',
    ci_run_id: 4242,
    tests: [
      { name: 'targeted', passed: true },
      { name: 'full-candidate-ci', passed: true },
    ],
    summary: 'Candidate work completed and CI verified.',
    created_at: new Date().toISOString(),
  }));

  const advanced = await runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl, repository: fixture.repository });
  assert.equal(advanced.completions.completed.length, 1);
  assert.equal(advanced.completions.completed[0].job_id, first.job.id);
  assert.notEqual(advanced.job.id, first.job.id, 'the supervisor must not idle on the completed job');
  assert.equal(advanced.job.roadmap_id, 'MEL-WORK-02');
  assert.equal(advanced.job.status, 'WAITING_TEACHER');
  assert.ok(advanced.teacher?.request_id, 'the next job should reach Teacher review in the same heartbeat');

  const finished = await fixture.repository.get(first.job.id);
  assert.equal(finished.status, 'COMPLETED');
  assert.equal(finished.result_json.autonomy_completion.status, 'VERIFIED');
});

test('cloud autonomy heartbeat rejects a non-candidate Teacher branch fail-closed', async () => {
  const fixture = runtimeFixture();
  fixture.env.MEL_TEACHER_BRANCH = 'main';
  await assert.rejects(
    () => runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl, repository: fixture.repository }),
    (error) => error?.code === 'AUTONOMY_BRANCH_NOT_CANDIDATE' || error?.code === 'TEACHER_BRANCH_NOT_CANDIDATE',
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { runAutonomyRuntimeTick } from '../src/evolution/autonomy-runtime.js';

const CANDIDATE_HEAD_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NEW_CANDIDATE_HEAD_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function runtimeFixture() {
  let replies = '';
  let completions = '';
  let candidateHead = CANDIDATE_HEAD_SHA;
  const aiCalls = [];
  const fetchCalls = [];
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const fetchImpl = async (url) => {
    const target = String(url);
    fetchCalls.push(target);
    if (target.includes('teacher-bridge/replies.jsonl')) return new Response(replies, { status: 200 });
    if (target.includes('teacher-bridge/completions.jsonl')) return new Response(completions, { status: 200 });
    if (target.includes('/commits/candidate%2Faugmentio-core')) return Response.json({ sha: candidateHead });
    if (target.includes('/actions/runs/4242')) {
      return Response.json({
        name: 'full-candidate-ci',
        head_sha: CANDIDATE_HEAD_SHA,
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
    MEL_GITHUB_BRANCH: 'candidate/augmentio-core',
    MEL_TEACHER_BRANCH: 'candidate/augmentio-core',
    AI: {
      async run(model) {
        aiCalls.push(model);
        return { response: `FICHIERS: src/evolution/autonomy-runtime.js\nCHANGEMENTS: proposition bornée de ${model}\nREUTILISATION: étendre les composants existants; aucun second orchestrateur\nTESTS: npm test\nRISQUES: faibles\nROLLBACK: revert candidate\nCRITERES_DE_FIN: CI complète verte` };
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
    setCandidateHead(value) { candidateHead = value; },
    getCandidateHead() { return candidateHead; },
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
  const stored = await fixture.repository.get(first.job.id);
  assert.equal(stored.result_json.teacher_bridge.request.candidate.sha, CANDIDATE_HEAD_SHA, 'Teacher request must be bound to the exact inspected candidate HEAD');
  assert.equal(stored.result_json.teacher_bridge.request.provenance.candidate_sha, CANDIDATE_HEAD_SHA);

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

test('stale Teacher approval is archived and requeued for a fresh Council and exact-SHA review', async () => {
  const fixture = runtimeFixture();
  const first = await runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl, repository: fixture.repository });
  const firstRequestId = first.teacher.request_id;
  assert.ok(firstRequestId);

  fixture.setReplies(JSON.stringify({
    kind: 'TEACHER_REPLY',
    request_id: firstRequestId,
    verdict: 'APPROVE_PLAN',
    feedback: 'Proceed only on the reviewed candidate SHA.',
  }));
  fixture.setCandidateHead(NEW_CANDIDATE_HEAD_SHA);

  const stale = await runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl, repository: fixture.repository });
  assert.equal(stale.reconciliation.applied.length, 1);
  assert.equal(stale.implementation.status, 'NOT_READY');
  assert.equal(stale.implementation.code, 'TEACHER_APPROVAL_CANDIDATE_SHA_STALE');
  assert.equal(stale.job.id, first.job.id);
  assert.equal(stale.job.status, 'QUEUED');

  const requeued = await fixture.repository.get(first.job.id);
  assert.equal(requeued.status, 'QUEUED');
  assert.equal(requeued.result_json.teacher_bridge, null);
  assert.equal(requeued.result_json.implementation_proposal, undefined);
  assert.equal(requeued.result_json.implementation_planning_diagnostic.code, 'TEACHER_APPROVAL_CANDIDATE_SHA_STALE');
  assert.equal(requeued.result_json.teacher_bridge_history.length, 1);
  assert.equal(requeued.result_json.teacher_bridge_history[0].review.request_id, firstRequestId);
  assert.equal(requeued.result_json.last_teacher_review.request_id, firstRequestId);
  assert.equal(requeued.plan_json.preflight, null);
  assert.equal(requeued.plan_json.revision.reason, 'TEACHER_APPROVAL_CANDIDATE_SHA_STALE');

  fixture.setReplies('');
  const refreshed = await runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl, repository: fixture.repository });
  assert.equal(refreshed.job.id, first.job.id);
  assert.equal(refreshed.job.status, 'WAITING_TEACHER');
  assert.ok(refreshed.teacher?.request_id);
  assert.notEqual(refreshed.teacher.request_id, firstRequestId);
  const freshStored = await fixture.repository.get(first.job.id);
  assert.equal(freshStored.result_json.teacher_bridge.request.candidate.sha, NEW_CANDIDATE_HEAD_SHA);
  assert.equal(freshStored.result_json.teacher_bridge.request.provenance.revision_of, firstRequestId);
});

test('planner failure persists only a sanitized diagnostic code for later runtime inspection', async () => {
  const fixture = runtimeFixture();
  const first = await runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl, repository: fixture.repository });
  fixture.setReplies(JSON.stringify({
    kind: 'TEACHER_REPLY',
    request_id: first.teacher.request_id,
    verdict: 'APPROVE_PLAN',
    feedback: 'Proceed on candidate only.',
  }));
  fixture.env.AI.run = async () => {
    const error = new Error('Bearer private-token-must-never-be-persisted');
    error.code = 'ALL_PROVIDERS_FAILED';
    throw error;
  };

  const resumed = await runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl, repository: fixture.repository });
  assert.equal(resumed.job.status, 'TEACHER_APPROVED');
  assert.equal(resumed.implementation.status, 'NOT_READY');
  assert.equal(resumed.implementation.code, 'ALL_PROVIDERS_FAILED');
  const stored = await fixture.repository.get(first.job.id);
  assert.equal(stored.result_json.implementation_planning_diagnostic.status, 'NOT_READY');
  assert.equal(stored.result_json.implementation_planning_diagnostic.code, 'ALL_PROVIDERS_FAILED');
  assert.equal(JSON.stringify(stored.result_json).includes('private-token-must-never-be-persisted'), false);
});

test('NEEDS_CHANGES automatically re-runs Council and emits a new Teacher request for the same job', async () => {
  const fixture = runtimeFixture();
  const first = await runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl, repository: fixture.repository });
  const firstRequestId = first.teacher.request_id;
  const initialAiCalls = fixture.aiCalls.length;
  fixture.setReplies(JSON.stringify({
    kind: 'TEACHER_REPLY',
    request_id: firstRequestId,
    verdict: 'NEEDS_CHANGES',
    feedback: 'Inspect the completion reconciler and revise the plan.',
  }));

  const revised = await runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl, repository: fixture.repository });
  assert.equal(revised.reconciliation.applied.length, 1);
  assert.equal(revised.job.id, first.job.id);
  assert.equal(revised.job.status, 'WAITING_TEACHER');
  assert.ok(revised.teacher?.request_id);
  assert.notEqual(revised.teacher.request_id, firstRequestId);
  assert.ok(fixture.aiCalls.length >= initialAiCalls + 2, 'revision must perform a fresh multi-AI Council');
  const stored = await fixture.repository.get(first.job.id);
  assert.equal(stored.result_json.teacher_bridge_history.length, 1);
  assert.equal(stored.result_json.last_teacher_review.request_id, firstRequestId);
  assert.equal(stored.result_json.teacher_bridge.request.provenance.revision_of, firstRequestId);
});

test('Teacher REJECT terminates only the rejected item and immediately moves autonomy to the next safe roadmap item', async () => {
  const fixture = runtimeFixture();
  const first = await runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl, repository: fixture.repository });
  fixture.setReplies(JSON.stringify({
    kind: 'TEACHER_REPLY',
    request_id: first.teacher.request_id,
    verdict: 'REJECT',
    feedback: 'This plan must not be implemented.',
  }));

  const advanced = await runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl, repository: fixture.repository });
  const rejected = await fixture.repository.get(first.job.id);
  assert.equal(rejected.status, 'FAILED');
  assert.equal(rejected.result_json.autonomy_blocked, true);
  assert.notEqual(advanced.job.id, first.job.id);
  assert.equal(advanced.job.roadmap_id, 'MEL-WORK-02');
  assert.equal(advanced.job.status, 'WAITING_TEACHER');
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
    candidate_sha: CANDIDATE_HEAD_SHA,
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

test('cloud autonomy heartbeat rejects divergent canonical and Teacher candidate branches fail-closed', async () => {
  const fixture = runtimeFixture();
  fixture.env.MEL_GITHUB_BRANCH = 'candidate/mel-clean-autonomy';
  fixture.env.MEL_TEACHER_BRANCH = 'candidate/augmentio-core';
  await assert.rejects(
    () => runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl, repository: fixture.repository }),
    (error) => error?.code === 'AUTONOMY_CANDIDATE_BRANCH_DIVERGENCE',
  );
});

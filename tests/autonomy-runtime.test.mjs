import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { runAutonomyRuntimeTick as runAutonomyRuntimeTickRaw, prepareAutonomyTeacherRequest } from '../src/evolution/autonomy-runtime.js';
import { selectNextAutonomyItem } from '../src/evolution/autonomy-supervisor.js';
import { completeTeacherCouncil } from './helpers/teacher-review-fixtures.mjs';

process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = '1';

const CANDIDATE_HEAD_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NEW_CANDIDATE_HEAD_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const THIRD_CANDIDATE_HEAD_SHA = 'cccccccccccccccccccccccccccccccccccccccc';
const TEST_ROADMAP = Object.freeze([
  { id: 'TEST-AUTONOMY-01', title: 'Synthetic autonomy item 1', status: 'IN_PROGRESS', next: 'test', priority: 'P0' },
  { id: 'TEST-AUTONOMY-02', title: 'Synthetic autonomy item 2', status: 'PARTIAL', next: 'test', priority: 'P0' },
  { id: 'TEST-AUTONOMY-03', title: 'Synthetic autonomy item 3', status: 'PLANNED', next: 'test', priority: 'P0' },
]);
const FIRST_AUTONOMY_ID = selectNextAutonomyItem({ roadmap: TEST_ROADMAP })?.id;
const SECOND_AUTONOMY_ID = selectNextAutonomyItem({ roadmap: TEST_ROADMAP, completedIds: [FIRST_AUTONOMY_ID] })?.id;
const THIRD_AUTONOMY_ID = selectNextAutonomyItem({ roadmap: TEST_ROADMAP, completedIds: [FIRST_AUTONOMY_ID, SECOND_AUTONOMY_ID] })?.id;

async function runAutonomyRuntimeTick(env, options = {}) {
  return runAutonomyRuntimeTickRaw(env, { ...options, roadmap: TEST_ROADMAP });
}

function runtimeFixture() {
  let replies = '';
  let completions = '';
  let candidateHead = CANDIDATE_HEAD_SHA;
  const ciHeads = new Map([[4242, CANDIDATE_HEAD_SHA]]);
  const aiCalls = [];
  const fetchCalls = [];
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const fetchImpl = async (url) => {
    const target = String(url);
    fetchCalls.push(target);
    if (target.includes('teacher-bridge/replies.jsonl')) return new Response(replies, { status: 200 });
    if (target.includes('teacher-bridge/completions.jsonl')) return new Response(completions, { status: 200 });
    if (target.includes('/commits/candidate%2Fmel-clean-autonomy')) return Response.json({ sha: candidateHead });
    const exactCommitMatch = target.match(/\/commits\/([0-9a-f]{40})$/i);
    if (exactCommitMatch) return Response.json({ sha: exactCommitMatch[1].toLowerCase() });
    const ciRunMatch = target.match(/\/actions\/runs\/(\d+)/);
    if (ciRunMatch && ciHeads.has(Number(ciRunMatch[1]))) {
      return Response.json({
        name: 'full-candidate-ci',
        head_sha: ciHeads.get(Number(ciRunMatch[1])),
        head_branch: 'candidate/mel-clean-autonomy',
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
    MEL_GITHUB_BRANCH: 'candidate/mel-clean-autonomy',
    MEL_TEACHER_BRANCH: 'candidate/mel-clean-autonomy',
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
    setCiHead(runId, value) { ciHeads.set(Number(runId), value); },
    getCandidateHead() { return candidateHead; },
  };
}

test('cloud autonomy heartbeat creates P0 work, runs live Council, inspects candidate code, emits Teacher requests, and does not freeze behind a pending Teacher', async () => {
  const fixture = runtimeFixture();
  const first = await runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl, repository: fixture.repository });
  assert.equal(first.ok, true);
  assert.equal(first.ensured.created, true);
  assert.equal(first.job.roadmap_id, FIRST_AUTONOMY_ID);
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
  assert.equal(second.ensured.created, true, 'normal mode must create compatible follow-up work instead of freezing behind Teacher');
  assert.notEqual(second.job.id, first.job.id);
  assert.equal(second.job.roadmap_id, SECOND_AUTONOMY_ID);
  assert.equal(second.job.status, 'WAITING_TEACHER');
  assert.ok(second.teacher?.request_id);
  assert.ok(fixture.aiCalls.length >= aiCallCount + 2, 'the next compatible work item must run its own Council');
  const stillWaiting = await fixture.repository.get(first.job.id);
  assert.equal(stillWaiting.status, 'WAITING_TEACHER', 'the original Teacher request must remain tracked while MEL advances');
});

test('manual main preview inspects the exact deployed SHA while preserving canonical candidate governance', async () => {
  const fixture = runtimeFixture();
  fixture.env.MEL_PREVIEW_ISOLATED = 'true';
  fixture.env.MEL_RUNTIME_ENV = 'preview';
  fixture.env.MEL_DEPLOYED_GIT_BRANCH = 'main';
  fixture.env.MEL_DEPLOYED_GIT_SHA = CANDIDATE_HEAD_SHA;

  const result = await runAutonomyRuntimeTick(fixture.env, {
    fetchImpl: fixture.fetchImpl,
    repository: fixture.repository,
  });

  assert.equal(result.ok, true);
  assert.equal(result.job.status, 'WAITING_TEACHER');
  assert.equal(result.teacher.status, 'WAITING_TEACHER');
  const stored = await fixture.repository.get(result.job.id);
  assert.equal(stored.result_json.teacher_bridge.request.candidate.branch, 'candidate/mel-clean-autonomy');
  assert.equal(stored.result_json.teacher_bridge.request.candidate.sha, CANDIDATE_HEAD_SHA);
  assert.ok(
    fixture.fetchCalls.some((url) => url.includes(`/commits/${CANDIDATE_HEAD_SHA}`)),
    'manual main preview must verify the immutable deployed SHA instead of requiring candidate branch HEAD to equal it',
  );
});

test('cloud autonomy heartbeat consumes the matching canonical GitHub Teacher reply and resumes the same job', async () => {
  const fixture = runtimeFixture();
  const first = await runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl, repository: fixture.repository });
  assert.ok(first.teacher?.request_id);
  fixture.setReplies(JSON.stringify({
    kind: 'TEACHER_REPLY',
    request_id: first.teacher.request_id,
    target_sha: CANDIDATE_HEAD_SHA,
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
    target_sha: CANDIDATE_HEAD_SHA,
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
    target_sha: CANDIDATE_HEAD_SHA,
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
    target_sha: CANDIDATE_HEAD_SHA,
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
    target_sha: CANDIDATE_HEAD_SHA,
    verdict: 'REJECT',
    feedback: 'This plan must not be implemented.',
  }));

  const advanced = await runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl, repository: fixture.repository });
  const rejected = await fixture.repository.get(first.job.id);
  assert.equal(rejected.status, 'FAILED');
  assert.equal(rejected.result_json.autonomy_blocked, true);
  assert.notEqual(advanced.job.id, first.job.id);
  assert.equal(advanced.job.roadmap_id, SECOND_AUTONOMY_ID);
  assert.equal(advanced.job.status, 'WAITING_TEACHER');
});

test('verified completion closes the approved job and releases the next roadmap job in the same heartbeat', async () => {
  const fixture = runtimeFixture();
  const first = await runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl, repository: fixture.repository });
  const requestId = first.teacher.request_id;

  fixture.setReplies(JSON.stringify({
    kind: 'TEACHER_REPLY',
    request_id: requestId,
    target_sha: CANDIDATE_HEAD_SHA,
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
    candidate_branch: 'candidate/mel-clean-autonomy',
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
  assert.equal(advanced.job.roadmap_id, SECOND_AUTONOMY_ID);
  assert.equal(advanced.job.status, 'WAITING_TEACHER');
  assert.ok(advanced.teacher?.request_id, 'the next job should reach Teacher review in the same heartbeat');

  const finished = await fixture.repository.get(first.job.id);
  assert.equal(finished.status, 'COMPLETED');
  assert.equal(finished.result_json.autonomy_completion.status, 'VERIFIED');
});

test('GEN2-17 completes three coherent supervised candidate cycles across exact SHA revisions', async () => {
  const fixture = runtimeFixture();
  const completed = [];

  async function approve(jobResult, targetSha) {
    const requestId = jobResult.teacher?.request_id;
    assert.ok(requestId, 'cycle must have a Teacher request');
    fixture.setReplies(JSON.stringify({
      kind: 'TEACHER_REPLY',
      request_id: requestId,
      target_sha: targetSha,
      verdict: 'APPROVE_PLAN',
      feedback: 'Proceed on this exact candidate SHA only.',
    }));
    const approved = await runAutonomyRuntimeTick(fixture.env, {
      fetchImpl: fixture.fetchImpl,
      repository: fixture.repository,
    });
    assert.equal(approved.job.id, jobResult.job.id);
    assert.equal(approved.job.status, 'TEACHER_APPROVED');
    return { approved, requestId };
  }

  async function complete(jobResult, requestId, targetSha, ciRunId) {
    fixture.setCompletions(JSON.stringify({
      kind: 'MEL_WORK_COMPLETION',
      status: 'COMPLETED',
      job_id: jobResult.job.id,
      request_id: requestId,
      candidate_sha: targetSha,
      candidate_branch: 'candidate/mel-clean-autonomy',
      ci_run_id: ciRunId,
      tests: [
        { name: 'targeted', passed: true },
        { name: 'full-candidate-ci', passed: true },
      ],
      summary: 'Candidate cycle completed and CI verified.',
      created_at: new Date().toISOString(),
    }));
    const advanced = await runAutonomyRuntimeTick(fixture.env, {
      fetchImpl: fixture.fetchImpl,
      repository: fixture.repository,
    });
    assert.equal(advanced.completions.completed.length, 1);
    assert.equal(advanced.completions.completed[0].job_id, jobResult.job.id);
    const stored = await fixture.repository.get(jobResult.job.id);
    assert.equal(stored.status, 'COMPLETED');
    assert.equal(stored.result_json.autonomy_completion.status, 'VERIFIED');
    assert.equal(stored.result_json.autonomy_completion.candidate_sha, targetSha);
    completed.push({ job_id: jobResult.job.id, roadmap_id: jobResult.job.roadmap_id, candidate_sha: targetSha, ci_run_id: ciRunId });
    fixture.setCompletions('');
    return advanced;
  }

  async function refreshTeacherForNewHead(jobResult, previousSha, nextSha) {
    const staleRequest = jobResult.teacher?.request_id;
    assert.ok(staleRequest);
    fixture.setCandidateHead(nextSha);
    fixture.setReplies(JSON.stringify({
      kind: 'TEACHER_REPLY',
      request_id: staleRequest,
      target_sha: previousSha,
      verdict: 'APPROVE_PLAN',
      feedback: 'This approval intentionally targets the previous SHA.',
    }));
    const stale = await runAutonomyRuntimeTick(fixture.env, {
      fetchImpl: fixture.fetchImpl,
      repository: fixture.repository,
    });
    assert.equal(stale.job.id, jobResult.job.id);
    assert.equal(stale.job.status, 'QUEUED');
    assert.equal(stale.implementation.code, 'TEACHER_APPROVAL_CANDIDATE_SHA_STALE');

    fixture.setReplies('');
    const refreshed = await runAutonomyRuntimeTick(fixture.env, {
      fetchImpl: fixture.fetchImpl,
      repository: fixture.repository,
    });
    assert.equal(refreshed.job.id, jobResult.job.id);
    assert.equal(refreshed.job.status, 'WAITING_TEACHER');
    assert.notEqual(refreshed.teacher?.request_id, staleRequest);
    const stored = await fixture.repository.get(jobResult.job.id);
    assert.equal(stored.result_json.teacher_bridge.request.candidate.sha, nextSha);
    return refreshed;
  }

  const first = await runAutonomyRuntimeTick(fixture.env, {
    fetchImpl: fixture.fetchImpl,
    repository: fixture.repository,
  });
  assert.equal(first.job.roadmap_id, FIRST_AUTONOMY_ID);
  const firstApproval = await approve(first, CANDIDATE_HEAD_SHA);
  const secondInitial = await complete(first, firstApproval.requestId, CANDIDATE_HEAD_SHA, 4242);
  assert.equal(secondInitial.job.roadmap_id, SECOND_AUTONOMY_ID);

  fixture.setCiHead(4243, NEW_CANDIDATE_HEAD_SHA);
  const second = await refreshTeacherForNewHead(secondInitial, CANDIDATE_HEAD_SHA, NEW_CANDIDATE_HEAD_SHA);
  const secondApproval = await approve(second, NEW_CANDIDATE_HEAD_SHA);
  const thirdInitial = await complete(second, secondApproval.requestId, NEW_CANDIDATE_HEAD_SHA, 4243);
  assert.equal(thirdInitial.job.roadmap_id, THIRD_AUTONOMY_ID);

  fixture.setCiHead(4244, THIRD_CANDIDATE_HEAD_SHA);
  const third = await refreshTeacherForNewHead(thirdInitial, NEW_CANDIDATE_HEAD_SHA, THIRD_CANDIDATE_HEAD_SHA);
  const thirdApproval = await approve(third, THIRD_CANDIDATE_HEAD_SHA);
  await complete(third, thirdApproval.requestId, THIRD_CANDIDATE_HEAD_SHA, 4244);

  assert.equal(completed.length, 3);
  assert.deepEqual(completed.map(row => row.roadmap_id), [
    FIRST_AUTONOMY_ID,
    SECOND_AUTONOMY_ID,
    THIRD_AUTONOMY_ID,
  ]);
  assert.deepEqual(completed.map(row => row.candidate_sha), [
    CANDIDATE_HEAD_SHA,
    NEW_CANDIDATE_HEAD_SHA,
    THIRD_CANDIDATE_HEAD_SHA,
  ]);
  assert.ok(new Set(completed.map(row => row.job_id)).size === 3);
  assert.ok(fixture.aiCalls.length >= 6, 'three cycles must execute multi-model Council work');
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
  fixture.env.MEL_TEACHER_BRANCH = 'candidate/divergent-teacher-test';
  await assert.rejects(
    () => runAutonomyRuntimeTick(fixture.env, { fetchImpl: fixture.fetchImpl, repository: fixture.repository }),
    (error) => error?.code === 'AUTONOMY_CANDIDATE_BRANCH_DIVERGENCE',
  );
});

test('GEN2-42 minimal inspection skips code search and caps file reads before Teacher handoff', async () => {
  const repo = new D1DevJobRepository(null, { memoryStore: new Map() });
  const created = await repo.create({
    id: `minimal-inspection-${crypto.randomUUID()}`,
    requested_by: 'mel-autonomy',
    goal: 'Bound GEN2-42 Teacher inspection',
    optional_context: {
      roadmap_id: 'GEN2-42',
      source: 'ecosystem-watch',
      inspection_paths: [
        'src/evaluation/capability-watch-runtime.js',
        'src/evolution/autonomy-runtime-core.js',
        'src/roadmap/master-roadmap.js',
        'src/index.js',
      ],
    },
  });
  const job = await repo.update(created.id, {
    status: 'COUNCIL_COMPLETE',
    plan_json: {
      preflight: {
        stage: 'AI_STATE_OF_PLAY_COMPLETE',
        council: completeTeacherCouncil(),
      },
    },
  });

  const calls = [];
  const candidateSha = 'c'.repeat(40);
  const fetchImpl = async (url) => {
    const target = String(url);
    calls.push(target);
    if (target.includes('/git/ref/heads/')) return Response.json({ object: { sha: candidateSha } });
    if (target.includes('/branches/')) return Response.json({ commit: { sha: candidateSha } });
    if (target.includes('/contents/')) {
      return Response.json({
        path: decodeURIComponent(target.split('/contents/')[1].split('?')[0]),
        sha: 'd'.repeat(40),
        content: Buffer.from('export const ok = true;').toString('base64'),
        encoding: 'base64',
      });
    }
    if (target.includes('/search/code')) throw new Error('minimal inspection must not search code');
    return new Response('not found', { status: 404 });
  };

  const state = await prepareAutonomyTeacherRequest({
    env: {
      MEL_GITHUB_REPOSITORY: 'owner/repo',
      MEL_GITHUB_BRANCH: 'candidate/mel-clean-autonomy',
      MEL_TEACHER_BRANCH: 'candidate/mel-clean-autonomy',
    },
    repository: repo,
    job,
    fetchImpl,
    minimalInspection: true,
  });

  assert.equal(state.status, 'WAITING_TEACHER');
  assert.match(state.request.request_id, /.+/);
  assert.equal(calls.some(url => url.includes('/search/code')), false);
  assert.ok(calls.filter(url => url.includes('/contents/')).length <= 3);
});

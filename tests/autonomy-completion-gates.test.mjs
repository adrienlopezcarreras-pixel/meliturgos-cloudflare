import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { reconcileRuntimeCompletions } from '../src/teachers/github-completion-reconciler.js';

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const REQUEST = 'runtime-request-1';
const JOB = 'job-completion-gate';
const BRANCH = 'candidate/augmentio-core';

function completionLine(overrides = {}) {
  return JSON.stringify({
    kind: 'MEL_WORK_COMPLETION',
    status: 'COMPLETED',
    job_id: JOB,
    request_id: REQUEST,
    candidate_sha: SHA,
    candidate_branch: BRANCH,
    ci_run_id: 4242,
    tests: [{ name: 'full candidate suite', passed: true }],
    summary: 'candidate verified',
    ...overrides,
  });
}

function fetchImplFor(line = completionLine()) {
  return async (url) => {
    const target = String(url);
    if (target.includes('teacher-bridge/completions.jsonl')) return new Response(`${line}\n`, { status: 200 });
    if (target.includes('/actions/runs/4242')) {
      return Response.json({
        name: 'full-candidate-ci',
        head_sha: SHA,
        head_branch: BRANCH,
        status: 'completed',
        conclusion: 'success',
      });
    }
    return new Response('not found', { status: 404 });
  };
}

async function approvedRepository({ proposal = true, proposalRequest = REQUEST, proposalBranch = BRANCH } = {}) {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await repository.create({ id: JOB, requested_by: 'mel-autonomy', goal: 'x' });
  await repository.update(job.id, {
    status: 'TEACHER_APPROVED',
    result_json: {
      teacher_bridge: {
        status: 'ANSWERED',
        request: { request_id: REQUEST },
        review: { request_id: REQUEST, verdict: 'APPROVE_PLAN', development_allowed: true },
      },
      implementation_proposal: proposal ? {
        status: 'READY',
        teacher_request_id: proposalRequest,
        candidate_branch: proposalBranch,
        providers_attempted: ['workers-ai:a', 'workers-ai:b'],
        inspected_files: [{ path: 'src/evolution/autonomy-runtime.js', sha: 'source-sha' }],
        selected: { provider: 'workers-ai', model: 'a', text: 'bounded implementation plan' },
        production_touched: false,
        candidate_write_performed: false,
      } : null,
    },
  });
  return repository;
}

test('a green CI cannot complete an approved job before MEL has produced her own multi-AI implementation proposal', async () => {
  const repository = await approvedRepository({ proposal: false });
  const result = await reconcileRuntimeCompletions({
    repository,
    env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH },
    fetchImpl: fetchImplFor(),
  });
  assert.equal(result.completed.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0].code, 'COMPLETION_MEL_IMPLEMENTATION_PROPOSAL_REQUIRED');
  const stored = await repository.get(JOB);
  assert.equal(stored.status, 'TEACHER_APPROVED');
  assert.equal(stored.result_json.autonomy_completion, undefined);
});

test('implementation proposal must be correlated to the same Teacher request and candidate branch', async () => {
  for (const options of [
    { proposalRequest: 'wrong-request' },
    { proposalBranch: 'candidate/other' },
  ]) {
    const repository = await approvedRepository(options);
    const result = await reconcileRuntimeCompletions({
      repository,
      env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH },
      fetchImpl: fetchImplFor(),
    });
    assert.equal(result.completed.length, 0);
    assert.equal(result.rejected[0].code, 'COMPLETION_MEL_IMPLEMENTATION_PROPOSAL_REQUIRED');
  }
});

test('correlated MEL proposal plus exact successful full-candidate-ci evidence completes the job', async () => {
  const repository = await approvedRepository();
  const result = await reconcileRuntimeCompletions({
    repository,
    env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH },
    fetchImpl: fetchImplFor(),
  });
  assert.equal(result.rejected.length, 0);
  assert.equal(result.completed.length, 1);
  assert.equal(result.completed[0].candidate_sha, SHA);
  const stored = await repository.get(JOB);
  assert.equal(stored.status, 'COMPLETED');
  assert.equal(stored.result_json.autonomy_completion.status, 'VERIFIED');
  assert.equal(stored.result_json.autonomy_completion.mel_implementation.verified, true);
  assert.equal(stored.result_json.autonomy_completion.mel_implementation.providers_attempted, 2);
  assert.equal(stored.result_json.autonomy_completion.mel_implementation.selected_model, 'a');
});

// Council-approved completion: no hand-written Teacher record exists, the
// Council approved the exact candidate SHA and full-candidate-ci is green on it.
async function councilDb(decision, extra = {}) {
  const { sqliteD1 } = await import('./helpers/sqlite-d1.mjs');
  const db = sqliteD1();
  await db.prepare('CREATE TABLE dev_bridge_state(bridge_id TEXT PRIMARY KEY, last_seen INTEGER, status TEXT, metadata_json TEXT)').run();
  await db.prepare('INSERT INTO dev_bridge_state VALUES(?,?,?,?)')
    .bind(`council-review:${SHA}`, 1, decision, JSON.stringify({ decision, head: SHA, jobs: [JOB], reviewed_at: 1, ...extra })).run();
  return db;
}

function councilFetch({ green = true } = {}) {
  return async (url) => {
    const target = String(url);
    if (target.includes('teacher-bridge/completions.jsonl')) return new Response('not found', { status: 404 });
    if (target.includes('/actions/workflows/full-candidate-ci.yml/runs')) {
      return Response.json({ workflow_runs: green ? [{ id: 4242, head_sha: SHA, head_branch: BRANCH, status: 'completed', conclusion: 'success' }] : [] });
    }
    return fetchImplFor()(url);
  };
}

test('a Council-approved SHA with green full-candidate-ci completes the job without a manual Teacher record', async () => {
  const repository = await approvedRepository();
  const DB = await councilDb('APPROVED');
  try {
    const result = await reconcileRuntimeCompletions({
      repository,
      env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH, DB },
      fetchImpl: councilFetch(),
    });
    assert.equal(result.completed.length, 1, JSON.stringify(result.rejected));
    const stored = await repository.get(JOB);
    assert.equal(stored.status, 'COMPLETED');
    assert.equal(stored.result_json.autonomy_completion.ci.run_id, 4242);
  } finally { DB.close(); }
});

test('Council approval alone, a rejected review, or a non-green CI never completes a job', async () => {
  for (const [decision, green] of [['APPROVED', false], ['REJECTED', true]]) {
    const repository = await approvedRepository();
    const DB = await councilDb(decision);
    try {
      const result = await reconcileRuntimeCompletions({
        repository,
        env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH, DB },
        fetchImpl: councilFetch({ green }),
      });
      assert.equal(result.completed.length, 0);
      assert.equal((await repository.get(JOB)).status, 'TEACHER_APPROVED');
    } finally { DB.close(); }
  }
});

test('a VERIFY_EXISTING decision is completed once the Council approved its evidence on a green SHA', async () => {
  const repository = await approvedRepository();
  const job = await repository.get(JOB);
  await repository.update(JOB, {
    result_json: { ...job.result_json, implementation_proposal: { ...job.result_json.implementation_proposal, status: 'VERIFY_EXISTING', decision: 'VERIFY_EXISTING' } },
  });
  const { reviewVerificationEvidence } = await import('../src/evolution/council-review.js');
  const { sqliteD1 } = await import('./helpers/sqlite-d1.mjs');
  const DB = sqliteD1();
  await DB.prepare('CREATE TABLE dev_bridge_state(bridge_id TEXT PRIMARY KEY, last_seen INTEGER, status TEXT, metadata_json TEXT)').run();
  try {
    const calls = [];
    const review = async (_env, input) => { calls.push(input); return { decision: 'APPROVED', reviews: [] }; };
    const current = await repository.get(JOB);
    const implementation = { ...current.result_json.implementation_proposal, candidate_sha: SHA };
    const first = await reviewVerificationEvidence({ DB }, { job: current, implementation, ciRunId: 4242, review });
    assert.equal(first.decision, 'APPROVED');
    assert.match(calls[0].diff, /AUCUN DIFF/);
    const again = await reviewVerificationEvidence({ DB }, { job: current, implementation, ciRunId: 4242, review });
    assert.equal(again.cached, true);
    assert.equal(calls.length, 1, 'an approved verification is not re-reviewed every minute');
    const result = await reconcileRuntimeCompletions({
      repository,
      env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH, DB },
      fetchImpl: councilFetch(),
    });
    assert.equal(result.completed.length, 1, JSON.stringify(result.rejected));
    assert.equal((await repository.get(JOB)).status, 'COMPLETED');
    assert.equal((await repository.get(JOB)).result_json.verify_existing.objective_assessment, 'ALREADY_IMPLEMENTED_VERIFIED');
  } finally { DB.close(); }
});

test('an external completion cannot certify VERIFY_EXISTING without its real persisted Council decision', async () => {
  const repository = await approvedRepository();
  const job = await repository.get(JOB);
  await repository.update(JOB, { result_json: { ...job.result_json, implementation_proposal: {
    ...job.result_json.implementation_proposal, status: 'VERIFY_EXISTING', decision: 'VERIFY_EXISTING',
  } } });
  const result = await reconcileRuntimeCompletions({ repository,
    env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH }, fetchImpl: fetchImplFor(),
  });
  assert.equal(result.completed.length, 0);
  assert.equal(result.rejected[0].code, 'COMPLETION_VERIFICATION_COUNCIL_REQUIRED');
  assert.equal((await repository.get(JOB)).status, 'TEACHER_APPROVED');
});

test('VERIFY_EXISTING runs the plan production reads and gives only their outcome to the Council', async () => {
  const { requestedLiveChecks, runLiveChecks } = await import('../src/evolution/verify-existing-live-checks.js');
  const plan = 'DECISION: VERIFY_EXISTING\nLIVE_CHECKS: gmail.messages.search, calendar.events.read, drive.files.list, gmail.messages.send';
  assert.deepEqual(requestedLiveChecks(plan), ['gmail.messages.search', 'calendar.events.read', 'drive.files.list'], 'only read-only checks');
  const executed = [];
  const createRuntime = async () => ({ bus: { async execute(id, input) {
    executed.push({ id, input });
    if (id === 'drive.files.list') throw Object.assign(new Error('x'), { code: 'GOOGLE_AUTH_REQUIRED' });
    return { messages: [{ subject: 'private-subject' }], events: [] };
  } } });
  const checks = await runLiveChecks({}, requestedLiveChecks(plan), { createRuntime });
  assert.equal(executed.length, 3);
  assert.equal(executed[0].input.limit, 1);
  assert.deepEqual(checks.map(c => [c.capability, c.ok, c.code]), [
    ['gmail.messages.search', true, null], ['calendar.events.read', true, null], ['drive.files.list', false, 'GOOGLE_AUTH_REQUIRED'],
  ]);
  assert.doesNotMatch(JSON.stringify(checks), /private-subject/);

  const { reviewVerificationEvidence } = await import('../src/evolution/council-review.js');
  const { sqliteD1 } = await import('./helpers/sqlite-d1.mjs');
  const DB = sqliteD1();
  try {
    await DB.prepare('CREATE TABLE dev_bridge_state(bridge_id TEXT PRIMARY KEY, last_seen INTEGER, status TEXT, metadata_json TEXT)').run();
    const seen = [];
    const review = async (_env, input) => { seen.push(input.diff); return { decision: 'REJECTED', reviews: [] }; };
    await reviewVerificationEvidence({ DB }, { job: { id: JOB, goal: 'x' }, implementation: { candidate_sha: SHA, selected: { text: plan } }, ciRunId: 4242, liveChecks: checks, review });
    assert.match(seen[0], /drive\.files\.list : ÉCHEC GOOGLE_AUTH_REQUIRED/);
    assert.match(seen[0], /gmail\.messages\.search : OK/);
  } finally { DB.close(); }
});

test('VERIFY_EXISTING closes only on successful production reads matching the objective', async () => {
  const { requiredLiveChecks, liveProofGate } = await import('../src/evolution/verify-existing-live-checks.js');
  const goal = 'Prouver en production une lecture Gmail, une lecture Agenda et une lecture Drive';
  const required = requiredLiveChecks(goal, 'DECISION: VERIFY_EXISTING\nLIVE_CHECKS:');
  assert.deepEqual(required, ['gmail.messages.search', 'calendar.events.read', 'drive.files.list'], 'the plan cannot drop a read the objective names');
  const ok = id => ({ capability: id, ok: true });
  assert.equal(liveProofGate(required, required.map(ok)).ok, true);
  assert.equal(liveProofGate(required, [ok('gmail.messages.search'), ok('calendar.events.read')]).code, 'VERIFY_EXISTING_LIVE_CHECK_FAILED:drive.files.list:NOT_RUN');
  assert.equal(liveProofGate(required, [...required.slice(0, 2).map(ok), { capability: 'drive.files.list', ok: false, code: 'GOOGLE_AUTH_REQUIRED' }]).code, 'VERIFY_EXISTING_LIVE_CHECK_FAILED:drive.files.list:GOOGLE_AUTH_REQUIRED');
  assert.equal(liveProofGate([], []).code, 'VERIFY_EXISTING_NO_FUNCTIONAL_PROOF', 'a green CI alone never closes VERIFY_EXISTING');
});

test('GPT6: no-code live checks must be related to the actual objective', async () => {
  const { hasObjectiveBoundVerificationChecks } = await import('../src/evolution/verify-existing-live-checks.js');
  assert.equal(hasObjectiveBoundVerificationChecks(
    '[MEL-FOUNDER-02] Persistance durable MAX entre ticks et libération du lease',
    'DECISION: VERIFY_EXISTING\nLIVE_CHECKS: gmail.messages.search, calendar.events.read, drive.files.list',
  ), false);
  assert.equal(hasObjectiveBoundVerificationChecks(
    'Prouver une lecture Gmail',
    'DECISION: VERIFY_EXISTING\nLIVE_CHECKS: gmail.messages.search',
  ), true);
  assert.equal(hasObjectiveBoundVerificationChecks(
    'Prouver une lecture Gmail',
    'DECISION: VERIFY_EXISTING\nLIVE_CHECKS: drive.files.list',
  ), false);
});

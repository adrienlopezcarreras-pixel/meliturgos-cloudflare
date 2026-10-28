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

async function approvedRepository({ proposal = true, proposalRequest = REQUEST, proposalBranch = BRANCH, roadmapId = null } = {}) {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await repository.create({ id: JOB, requested_by: 'mel-autonomy', goal: 'x',
    ...(roadmapId ? { optional_context: { roadmap_id: roadmapId } } : {}),
  });
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

test('GPT6: older job outside the bounded list can still complete by exact ID', async () => {
  const repository = await approvedRepository();
  const list = repository.list.bind(repository);
  repository.list = async () => (await list()).filter(job => job.id !== JOB);
  const result = await reconcileRuntimeCompletions({
    repository,
    env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH },
    fetchImpl: fetchImplFor(),
  });
  assert.equal(result.completed.length, 1);
  assert.equal((await repository.get(JOB)).status, 'COMPLETED');
});


test('MEL-MANIFEST-01 records all five truthful statuses without waiting for Gmail or paused hardware', async () => {
  const repository = await approvedRepository({ roadmapId: 'MEL-MANIFEST-01' });
  const result = await reconcileRuntimeCompletions({
    repository,
    env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH },
    fetchImpl: fetchImplFor(),
  });
  assert.equal(result.completed.length, 1, JSON.stringify(result.rejected));
  assert.equal(result.rejected.length, 0);
  const stored = await repository.get(JOB);
  assert.equal(stored.status, 'COMPLETED');
  const account = stored.result_json.autonomy_completion.manifest_01;
  assert.equal(account.account_verified, true);
  assert.equal(account.status, 'ACCOUNT_RECORDED_PENDING_PRIORITIES');
  assert.equal(account.all_priorities_verified, false);
  assert.equal(account.cloud_priorities_verified, false);
  assert.equal(account.priorities.length, 5);
  assert.deepEqual(account.priorities.map(row => row.priority), [0, 1, 2, 3, 4]);
  assert.ok(account.priorities.some(row => row.priority === 0 && row.verified === false),
    'Gmail remains a separate actionable founder job, not a false success');
  assert.ok(account.priorities.some(row => row.priority === 4
    && row.verified === false && row.blocking === false
    && row.reason === 'PHYSICAL_DEVICE_PROOF_REQUIRED'));
});

test('manifest acceptance never treats paused hardware as a blocker or as verified', async () => {
  const { MANIFEST_01_FOUNDATION, manifest01FoundationPrerequisites } = await import('../src/roadmap/manifest-01-acceptance.js');
  assert.equal(MANIFEST_01_FOUNDATION.length, 5);
  const synthetic = MANIFEST_01_FOUNDATION.map(row => ({ id: row.roadmap_id, status: 'DONE_VERIFIED' }));
  const ready = manifest01FoundationPrerequisites(synthetic);
  assert.equal(ready.ready, true);
  assert.equal(ready.all_verified, true);
  assert.equal(ready.reportable, true);
  assert.equal(ready.account_status, 'ALL_PRIORITIES_VERIFIED');
  assert.equal(ready.blocking_required_count, 4);
  assert.equal(ready.verified_count, 5);
  assert.equal(ready.pending.length, 0);
  assert.equal(ready.nonblocking_pending.length, 0);
  const notEnough = synthetic.map((row, i) => i === 3 ? { ...row, status: 'DONE' }
    : i === 4 ? { ...row, status: 'BLOCKED_HUMAN' } : row);
  const pending = manifest01FoundationPrerequisites(notEnough);
  assert.equal(pending.ready, false);
  assert.equal(pending.reportable, false, 'DONE is not a canonical verified or in-progress status');
  assert.equal(pending.verified_count, 3);
  assert.deepEqual(pending.pending.map(row => row.priority), [3, 4]);
  assert.deepEqual(pending.pending.map(row => row.reason), [
    'FOUNDER_REAL_EXECUTION_NOT_VERIFIED', 'PHYSICAL_DEVICE_PROOF_REQUIRED',
  ]);
  assert.deepEqual(pending.blocking_pending.map(row => row.priority), [3]);
  assert.deepEqual(pending.nonblocking_pending.map(row => row.priority), [4]);
  const cloudDoneHardwarePaused = synthetic.map((row, i) => i === 4
    ? { ...row, status: 'BLOCKED_HUMAN' } : row);
  const cloudReady = manifest01FoundationPrerequisites(cloudDoneHardwarePaused);
  assert.equal(cloudReady.ready, true, 'cloud tasks must finish without an APK/MINI/Companion');
  assert.equal(cloudReady.all_verified, false, 'hardware is not silently certified');
  assert.equal(cloudReady.reportable, true, 'a truthful account is valid while physical tests are paused');
  assert.equal(cloudReady.verified_count, 4);
  assert.deepEqual(cloudReady.nonblocking_pending.map(row => row.roadmap_id), ['MEL-FOUNDER-06']);
  assert.equal(cloudReady.priorities[4].verified, false);
  assert.equal(cloudReady.priorities[4].blocking, false);
  assert.equal(manifest01FoundationPrerequisites([]).ready, false, 'missing cloud entries cannot create evidence');
  assert.equal(manifest01FoundationPrerequisites([]).reportable, false);
  const inProgress = synthetic.map(row => ({ ...row, status: row.id === 'MEL-FOUNDER-06' ? 'BLOCKED_HUMAN' : 'IN_PROGRESS' }));
  const account = manifest01FoundationPrerequisites(inProgress);
  assert.equal(account.reportable, true, 'accounting is possible before the founder jobs execute');
  assert.equal(account.ready, false, 'the reported founder jobs are not verified');
  assert.equal(account.account_status, 'ACCOUNT_RECORDED_PENDING_PRIORITIES');
});


test('FOUNDER-01 accepts exact observed Gmail auth-block, not an invented Gmail read', async () => {
  const { runLiveChecks, liveProofGate, requiredLiveChecks } = await import('../src/evolution/verify-existing-live-checks.js');
  const goal = "[MEL-FOUNDER-01] Prouver en production une lecture Gmail, une lecture Agenda et une lecture Drive, ou l’erreur d’authentification exacte de chacune.";
  const required = requiredLiveChecks(goal, 'DECISION: VERIFY_EXISTING\nLIVE_CHECKS:');
  assert.deepEqual(required, ['gmail.messages.search', 'calendar.events.read', 'drive.files.list']);
  const calls = [];
  const createRuntime = async () => ({ bus: {
    async execute(id) {
      calls.push(id);
      if (id === 'gmail.messages.search') {
        const error = new Error('GMAIL_SEARCH_FAILED_ALL_PATHS_FAILED');
        error.code = 'GMAIL_SEARCH_FAILED_ALL_PATHS_FAILED';
        error.native_code = 'GMAIL_SEARCH_FAILED_NETWORK';
        error.fallback_code = 'PIPEDREAM_GMAIL_ACCOUNT_REQUIRED';
        throw error;
      }
      if (id === 'calendar.events.read') return { events: [] };
      return { files: [{ id: 'file-id-private', name: 'private-name' }] };
    },
  } });
  const checks = await runLiveChecks({}, required, { createRuntime });
  assert.deepEqual(calls, required);
  assert.deepEqual(checks.map(c => [c.outcome, c.ok]), [
    ['AUTH_REQUIRED', false], ['READ_SUCCEEDED', true], ['READ_SUCCEEDED', true],
  ]);
  assert.equal(checks[0].code, 'PIPEDREAM_GMAIL_ACCOUNT_REQUIRED');
  assert.equal(checks[0].items, null);
  assert.equal(liveProofGate(required, checks, { goal }).ok, true);
  assert.deepEqual(liveProofGate(required, checks, { goal }).auth_missing, ['gmail.messages.search']);
  assert.equal(liveProofGate(required, checks).ok, false, 'other goals still demand a real read');
  assert.doesNotMatch(JSON.stringify(checks), /private-name|file-id-private/);
});

test('FOUNDER-01 refuses network errors, missing permissions, generic provider outages and fake empty success', async () => {
  const { runLiveChecks, liveProofGate, requiredLiveChecks } = await import('../src/evolution/verify-existing-live-checks.js');
  const goal = "[MEL-FOUNDER-01] Gmail Agenda Drive ou l’erreur d’authentification exacte de chacune";
  const required = requiredLiveChecks(goal, '');
  for (const code of ['GMAIL_SEARCH_FAILED_NETWORK', 'CAPABILITY_UNAVAILABLE', 'CAPABILITY_PERMISSION_DENIED', 'GMAIL_SEARCH_FAILED_ALL_PATHS_FAILED']) {
    const fail = [
      { capability: 'gmail.messages.search', ok: false, outcome: 'FAILED', code },
      { capability: 'calendar.events.read', ok: true, outcome: 'READ_SUCCEEDED' },
      { capability: 'drive.files.list', ok: true, outcome: 'READ_SUCCEEDED' },
    ];
    assert.equal(liveProofGate(required, fail, { goal }).ok, false, code);
  }
  const malformed = await runLiveChecks({}, required, { createRuntime: async () => ({ bus: {
    execute: async () => ({ ok: true }),
  } }) });
  assert.equal(malformed.every(row => row.ok === false && row.code === 'CAPABILITY_READ_RESULT_INVALID'), true);
  assert.equal(liveProofGate(required, malformed, { goal }).ok, false);
});

test('FOUNDER-01 keeps the original D1 job uncompleted when runtime evidence is absent', async () => {
  const repository = await approvedRepository({ roadmapId: 'MEL-FOUNDER-01' });
  const goal = "[MEL-FOUNDER-01] Prouver en production une lecture Gmail, une lecture Agenda et une lecture Drive, ou l’erreur d’authentification exacte de chacune.";
  const before = await repository.get(JOB);
  await repository.update(JOB, { goal });
  const statusBefore = (await repository.get(JOB)).status;
  let checked = 0;
  const result = await reconcileRuntimeCompletions({
    repository,
    env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH },
    fetchImpl: fetchImplFor(),
    liveCheckRunner: async () => {
      checked++;
      return [
        { capability: 'gmail.messages.search', ok: false, outcome: 'FAILED', code: 'GMAIL_SEARCH_FAILED_NETWORK' },
        { capability: 'calendar.events.read', ok: true, outcome: 'READ_SUCCEEDED' },
        { capability: 'drive.files.list', ok: true, outcome: 'READ_SUCCEEDED' },
      ];
    },
  });
  assert.equal(checked, 1);
  assert.equal(result.completed.length, 0);
  assert.equal(result.rejected[0].code, 'COMPLETION_FOUNDER_01_LIVE_PROOF_REQUIRED');
  assert.equal((await repository.get(JOB)).status, statusBefore);
  assert.equal((await repository.get(JOB)).result_json.autonomy_completion, undefined);
  assert.equal(before.result_json.teacher_bridge.status, 'ANSWERED');
});

test('FOUNDER-01 records honest read/auth evidence only after Teacher, exact-SHA CI and a real probe', async () => {
  const repository = await approvedRepository({ roadmapId: 'MEL-FOUNDER-01' });
  const goal = "[MEL-FOUNDER-01] Prouver en production une lecture Gmail, une lecture Agenda et une lecture Drive, ou l’erreur d’authentification exacte de chacune.";
  await repository.update(JOB, { goal });
  const result = await reconcileRuntimeCompletions({
    repository,
    env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH },
    fetchImpl: fetchImplFor(),
    liveCheckRunner: async (_env, ids) => {
      assert.deepEqual(ids, ['gmail.messages.search', 'calendar.events.read', 'drive.files.list']);
      return [
        { capability: ids[0], ok: false, outcome: 'AUTH_REQUIRED', code: 'PIPEDREAM_GMAIL_ACCOUNT_REQUIRED', items: null },
        { capability: ids[1], ok: true, outcome: 'READ_SUCCEEDED', items: 0 },
        { capability: ids[2], ok: true, outcome: 'READ_SUCCEEDED', items: 1 },
      ];
    },
  });
  assert.equal(result.rejected.length, 0);
  assert.equal(result.completed.length, 1);
  const stored = await repository.get(JOB);
  assert.equal(stored.status, 'COMPLETED');
  const proof = stored.result_json.autonomy_completion.founder_01_live_proof;
  assert.equal(proof.status, 'READS_OR_EXACT_AUTH_DIAGNOSTICS');
  assert.deepEqual(proof.auth_missing, ['gmail.messages.search']);
  assert.equal(proof.checked[0].ok, false, 'Gmail still is not connected');
  assert.equal(proof.checked[0].code, 'PIPEDREAM_GMAIL_ACCOUNT_REQUIRED');
});

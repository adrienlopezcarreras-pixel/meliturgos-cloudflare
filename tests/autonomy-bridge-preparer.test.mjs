import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { prepareApprovedBridgePackage, normalizeTests } from '../src/evolution/autonomy-bridge-preparer.js';
import { MentorEngine } from '../src/learning/mentor-engine.js';
import { MentorMemoryRepository } from '../src/learning/mentor-memory.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const SHA = 'cccccccccccccccccccccccccccccccccccccccc';
const BRANCH = 'candidate/augmentio-core';
const REQUEST = 'bridge-prep-request';

async function approvedRepository(db = null) {
  const repository = new D1DevJobRepository(db, { memoryStore: new Map() });
  const job = await repository.create({ id: 'bridge-prep-job', requested_by: 'mel-autonomy', goal: 'Ajouter une petite capacité testée' });
  await repository.update(job.id, {
    status: 'TEACHER_APPROVED',
    result_json: {
      teacher_bridge: {
        status: 'ANSWERED',
        request: { request_id: REQUEST },
        review: { request_id: REQUEST, verdict: 'APPROVE_PLAN', development_allowed: true },
      },
      implementation_proposal: {
        status: 'READY',
        teacher_request_id: REQUEST,
        candidate_branch: BRANCH,
        candidate_sha: SHA,
        inspected_files: [{ path: 'src/example.js', sha: 'source' }],
        providers_attempted: ['a','b'],
        selected: { model: 'a', text: 'plan' },
        production_touched: false,
        candidate_write_performed: false,
      },
    },
  });
  return repository;
}

function fetchImpl() {
  return async (url) => {
    const target = String(url);
    if (target.includes('/commits/candidate%2Faugmentio-core')) return Response.json({ sha: SHA });
    if (target.startsWith('https://api.github.com/')) return new Response('rate limited', { status: 403 });
    if (target.includes('/src/example.js')) return new Response('export const ready = false;\n', { status: 200, headers: { etag: 'example-etag' } });
    return new Response('not found', { status: 404 });
  };
}

function mentorEngine(calls) {
  return {
    async propose(input) {
      calls.push(input);
      const repairing = input.mode === 'repair';
      return {
        mode: input.mode,
        council: { selected_provider: 'fixture' },
        proposal: {
          summary: repairing ? 'Repair failed candidate tests.' : 'Turn the inspected file into a tested implementation.',
          changes: [{ path: 'src/example.js', content: repairing ? 'export const ready = "repaired";\n' : 'export const ready = true;\n', reason: repairing ? 'Repair failing test' : 'Implement feature' }],
          tests: ['test', 'test:smoke', 'test:integration'],
          confidence: 0.94,
          lessons: ['Keep the change bounded.'],
          risks: ['Regression risk is covered by tests.'],
          provenance: { provider: 'fixture', model: 'fixture-code' },
        },
      };
    },
  };
}

test('approved Teacher + multi-AI plan becomes an applyable structured bridge package', async () => {
  const repository = await approvedRepository();
  const calls = [];
  const job = await repository.get('bridge-prep-job');
  const result = await prepareApprovedBridgePackage({
    env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH },
    repository,
    job,
    fetchImpl: fetchImpl(),
    mentorEngine: mentorEngine(calls),
  });
  assert.equal(result.status, 'READY');
  assert.equal(result.candidate_sha, SHA);
  assert.equal(result.teacher_request_id, REQUEST);
  assert.deepEqual(result.files, ['src/example.js']);
  assert.deepEqual(result.tests, ['test', 'test:smoke', 'test:integration']);
  assert.equal(result.production_deploy_allowed, false);
  assert.equal(result.human_release_approval_required, true);
  assert.equal(calls.length, 1);

  const stored = await repository.get('bridge-prep-job');
  assert.equal(stored.status, 'TEACHER_APPROVED');
  assert.equal(stored.files_json[0].path, 'src/example.js');
  assert.match(stored.files_json[0].content, /ready = true/);
  assert.deepEqual(stored.tests_json.map(row => row.command), ['test', 'test:smoke', 'test:integration']);
  assert.equal(stored.patch_json.source, 'MentorEngine');
  assert.equal(stored.patch_json.mode, 'implement');
  assert.equal(stored.result_json.teacher_bridge.status, 'ANSWERED');
  assert.equal(stored.result_json.teacher_bridge.review.request_id, REQUEST);
  assert.equal(stored.result_json.implementation_proposal.teacher_request_id, REQUEST);
});

test('bridge package is reused without asking Mentor twice when approval and candidate SHA are unchanged', async () => {
  const repository = await approvedRepository();
  const calls = [];
  const engine = mentorEngine(calls);
  const args = {
    env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH },
    repository,
    job: await repository.get('bridge-prep-job'),
    fetchImpl: fetchImpl(),
    mentorEngine: engine,
  };
  await prepareApprovedBridgePackage(args);
  const reused = await prepareApprovedBridgePackage({ ...args, job: await repository.get('bridge-prep-job') });
  assert.equal(reused.reused, true);
  assert.equal(calls.length, 1);
});

test('a failed bridge test invalidates the old package and creates one repair package for that exact result', async () => {
  const repository = await approvedRepository();
  const calls = [];
  const engine = mentorEngine(calls);
  const baseArgs = {
    env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH },
    repository,
    fetchImpl: fetchImpl(),
    mentorEngine: engine,
  };
  await prepareApprovedBridgePackage({ ...baseArgs, job: await repository.get('bridge-prep-job') });
  let current = await repository.get('bridge-prep-job');
  await repository.update(current.id, {
    result_json: {
      ...current.result_json,
      dev_bridge: {
        status: 'READY_FOR_REVIEW',
        needs_repair: true,
        received_at: '2026-09-10T21:45:00.000Z',
        tests: [{ name: 'test:smoke', passed: false, exit_code: 1, stderr: 'assertion failed' }],
      },
    },
  });
  const repair = await prepareApprovedBridgePackage({ ...baseArgs, job: await repository.get('bridge-prep-job') });
  assert.equal(repair.mentor.mode, 'repair');
  assert.equal(repair.repair_for_received_at, '2026-09-10T21:45:00.000Z');
  assert.equal(calls.length, 2);
  current = await repository.get('bridge-prep-job');
  assert.match(current.files_json[0].content, /repaired/);
  assert.equal(current.patch_json.mode, 'repair');
  assert.equal(current.result_json.teacher_bridge.status, 'ANSWERED');
  assert.equal(current.result_json.teacher_bridge.review.verdict, 'APPROVE_PLAN');
  assert.equal(current.result_json.implementation_proposal.teacher_request_id, REQUEST);
  assert.equal(current.result_json.dev_bridge.status, 'READY_FOR_REVIEW');
  assert.equal(current.result_json.dev_bridge.tests[0].stderr, 'assertion failed');
  assert.ok(current.result_json.dev_bridge.repair_package_created_at);

  const reusedRepair = await prepareApprovedBridgePackage({ ...baseArgs, job: current });
  assert.equal(reusedRepair.reused, true);
  assert.equal(calls.length, 2);
});

test('a failure from a plan replaced after a candidate SHA change is not repaired by the re-approved plan', async () => {
  const repository = await approvedRepository();
  const calls = [];
  const current = await repository.get('bridge-prep-job');
  await repository.update(current.id, {
    result_json: {
      ...current.result_json,
      teacher_bridge: { ...current.result_json.teacher_bridge, reviewed_at: '2026-10-20T21:04:46.196Z' },
      dev_bridge: {
        status: 'REPAIR_REQUIRED',
        needs_repair: true,
        candidate_sha: 'f'.repeat(40),
        received_at: '2026-10-20T16:06:30.801Z',
        tests: [{ name: 'syntax-and-imports', passed: false, exit_code: 1, error: 'Unresolved import in src/evolution/google-tools.js: googleapis' }],
      },
    },
  });
  const prepared = await prepareApprovedBridgePackage({
    env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH },
    repository,
    job: await repository.get('bridge-prep-job'),
    fetchImpl: fetchImpl(),
    mentorEngine: mentorEngine(calls),
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].mode, 'implement');
  assert.deepEqual(calls[0].previousAttempts, []);
  assert.doesNotMatch(JSON.stringify(calls[0]), /google-tools/);
  assert.equal(prepared.mentor.mode, 'implement');
  const stored = await repository.get('bridge-prep-job');
  assert.equal(stored.result_json.dev_bridge.tests[0].name, 'syntax-and-imports', 'the old failure stays in the journal');
});

test('bridge preparation continues from the exact approved SHA when GitHub HEAD APIs are unavailable', async () => {
  const repository = await approvedRepository();
  const calls = [];
  const outageFetch = async (url) => {
    const target = String(url);
    if (target.startsWith('https://api.github.com/')) return new Response('temporarily unavailable', { status: 503 });
    if (target.includes('/src/example.js')) return new Response('export const ready = false;\n', { status: 200, headers: { etag: 'example-etag' } });
    return new Response('not found', { status: 404 });
  };
  const result = await prepareApprovedBridgePackage({
    env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH },
    repository,
    job: await repository.get('bridge-prep-job'),
    fetchImpl: outageFetch,
    mentorEngine: mentorEngine(calls),
  });
  assert.equal(result.status, 'READY');
  assert.equal(result.candidate_sha, SHA);
  assert.deepEqual(result.files, ['src/example.js']);
  const stored = await repository.get('bridge-prep-job');
  assert.equal(stored.files_json.length, 1);
  assert.match(stored.files_json[0].content, /ready = true/);
  assert.equal(calls.length, 1);
});

test('bridge preparation fails closed on stale candidate or missing Teacher approval', async () => {
  const repository = await approvedRepository();
  const job = await repository.get('bridge-prep-job');
  const staleFetch = async (url) => {
    const target = String(url);
    if (target.includes('/git/ref/heads/')) return new Response('ref unavailable', { status: 404 });
    if (target.includes('/commits/')) return Response.json({ sha: 'dddddddddddddddddddddddddddddddddddddddd' });
    return fetchImpl()(url);
  };
  await assert.rejects(
    () => prepareApprovedBridgePackage({
      env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH },
      repository,
      job,
      fetchImpl: staleFetch,
      mentorEngine: mentorEngine([]),
    }),
    error => error.code === 'BRIDGE_PREPARATION_CANDIDATE_STALE'
  );

  await repository.update(job.id, { status: 'WAITING_TEACHER' });
  const waitingJob = await repository.get(job.id);
  await assert.rejects(
    () => prepareApprovedBridgePackage({
      env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH },
      repository,
      job: waitingJob,
      fetchImpl: fetchImpl(),
      mentorEngine: mentorEngine([]),
    }),
    error => error.code === 'TEACHER_APPROVAL_REQUIRED'
  );
});

test('bridge test normalization allows only bounded named scripts', () => {
  assert.deepEqual(normalizeTests(['test:smoke','arbitrary','test:integration','test:smoke']).map(row => row.command), ['test','test:smoke','test:integration']);
  assert.deepEqual(normalizeTests([]).map(row => row.command), ['test']);
});

test('simulated provider output passes through the real MentorEngine repair to a persisted Teacher-approved package', async () => {
  const DB = sqliteD1();
  try {
    const repository = await approvedRepository(DB);
    const sourceJob = await repository.get('bridge-prep-job');
    await repository.update(sourceJob.id, { result_json: { ...sourceJob.result_json, implementation_proposal: { ...sourceJob.result_json.implementation_proposal, inspected_files: [{ path: 'src/example.js' }, { path: 'tests/example.test.mjs' }] } } });
    const inspectedFetch = fetchImpl();
    const readBothSources = async url => String(url).includes('raw.githubusercontent.com') && String(url).includes('tests/example.test.mjs') ? new Response("import assert from 'node:assert/strict';\nassert.equal(false, false);\n") : inspectedFetch(url);
    const incomplete = 'FILE src/example.js\n<<<MEL_FILE\nexport const ready = true;\nMEL_FILE\nFILE tests/example.test.mjs\n<<<MEL_FILE\nimport assert from';
    const complete = `${incomplete} 'node:assert/strict';\nassert.equal(true, true);\nMEL_FILE`.replace(/\n/g, '\r\n');
    const calls = [];
    const engine = new MentorEngine({
      memory: new MentorMemoryRepository(DB),
      providerFactory: async () => [{
        id: 'simulated-code-provider',
        providerId: 'fixture',
        modelId: 'fixture-code',
        async invoke(input) {
          calls.push(input);
          return { text: calls.length === 1 ? incomplete : complete };
        },
      }],
    });

    const prepared = await prepareApprovedBridgePackage({
      env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH },
      repository,
      job: await repository.get('bridge-prep-job'),
      fetchImpl: readBothSources,
      mentorEngine: engine,
    });

    const stored = await new D1DevJobRepository(DB).get('bridge-prep-job');
    assert.equal(prepared.status, 'READY');
    assert.equal(prepared.mentor.council.selected_from_repair, true);
    assert.deepEqual(prepared.mentor.council.rejected_proposals, [
      { provider: 'simulated-code-provider', error: 'MENTOR_INVALID_CHANGE', stage: 'initial' },
    ]);
    assert.equal(calls.length, 2);
    assert.match(calls[1].input, /ERREUR_DE_VALIDATION: MENTOR_INVALID_CHANGE/);
    assert.deepEqual(stored.files_json.map(file => file.path), ['src/example.js', 'tests/example.test.mjs']);
    assert.match(stored.files_json[1].content, /assert.equal\(true, true\);/);
    assert.equal(stored.result_json.bridge_preparation.mentor.council.selected_from_repair, true);
    assert.equal(stored.status, 'TEACHER_APPROVED');
    assert.equal(stored.result_json.teacher_bridge.review.request_id, REQUEST);
    assert.equal(stored.result_json.implementation_proposal.teacher_request_id, REQUEST);
    assert.equal(prepared.production_deploy_allowed, false);
    assert.equal(prepared.human_release_approval_required, true);
    const experience = await DB.prepare('SELECT outcome, evidence_json FROM mentor_lessons WHERE job_id=?').bind(stored.id).first();
    assert.equal(experience.outcome, 'OBSERVED');
    assert.equal(JSON.parse(experience.evidence_json).experience.validated, false);
  } finally { DB.close(); }
});

test('real MentorEngine rejection propagates exact failure codes without persisting a partial bridge package', async () => {
  const DB = sqliteD1();
  try {
    const repository = await approvedRepository(DB);
    const incomplete = 'FILE src/example.js\n<<<MEL_FILE\nexport const ready = true;\nMEL_FILE\nFILE tests/example.test.mjs\n<<<MEL_FILE\nimport assert from';
    const engine = new MentorEngine({
      memory: new MentorMemoryRepository(DB),
      providerFactory: async () => [{
        id: 'simulated-truncated-provider',
        async invoke() { return { text: incomplete }; },
      }],
    });
    const job = await repository.get('bridge-prep-job');

    await assert.rejects(
      () => prepareApprovedBridgePackage({
        env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH },
        repository,
        job,
        fetchImpl: fetchImpl(),
        mentorEngine: engine,
      }),
      error => {
        assert.equal(error.code, 'MENTOR_NO_VALID_CODE_PROPOSAL');
        assert.deepEqual(error.failures.map(({ error, stage }) => ({ error, stage })), [
          { error: 'MENTOR_INVALID_CHANGE', stage: 'initial' },
          { error: 'MENTOR_INVALID_CHANGE', stage: 'repair' },
        ]);
        return true;
      },
    );
    const stored = await new D1DevJobRepository(DB).get('bridge-prep-job');
    assert.deepEqual(stored.files_json, []);
    assert.equal(stored.result_json.bridge_preparation, undefined);
    assert.equal(stored.result_json.teacher_bridge.review.request_id, REQUEST);
    const observations = await DB.prepare('SELECT COUNT(*) AS count FROM mentor_lessons WHERE job_id=?').bind(stored.id).first();
    assert.equal(observations.count, 0);
  } finally { DB.close(); }
});

// CODEX: a long Mentor request cannot replace an executor-owned package.
test('stale Mentor package cannot overwrite files or receipt after executor claim', async () => {
  const db = sqliteD1();
  try {
    const repository = await approvedRepository(db);
    const job = await repository.get('bridge-prep-job');
    let entered;
    const started = new Promise(resolve => { entered = resolve; });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const mentor = mentorEngine([]);
    const propose = mentor.propose;
    mentor.propose = async input => { entered(); await gate; return propose(input); };
    const pending = prepareApprovedBridgePackage({ env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH }, repository, job, fetchImpl: fetchImpl(), mentorEngine: mentor });
    await started;
    const receipt = { ...job.result_json, dev_bridge: { status: 'FAILED', error: 'EXECUTOR_TEST_FAILED' } };
    await repository.update(job.id, { status: 'FAILED', files_json: [{ path: 'src/owned.js', content: 'owned' }], result_json: receipt });
    release();
    await assert.rejects(pending, { code: 'JOB_UPDATE_CONFLICT' });
    const persisted = await repository.get(job.id);
    assert.equal(persisted.status, 'FAILED');
    assert.deepEqual(persisted.result_json, receipt);
    assert.deepEqual(persisted.files_json, [{ path: 'src/owned.js', content: 'owned' }]);
  } finally { db.close(); }
});

test('candidate advancing during Mentor inference cannot persist a package against the old SHA', async () => {
  const repository = await approvedRepository();
  let head = SHA;
  const read = fetchImpl();
  const movingFetch = async url => String(url).includes('/commits/candidate%2Faugmentio-core') ? Response.json({ sha: head }) : read(url);
  const engine = mentorEngine([]);
  await assert.rejects(prepareApprovedBridgePackage({ env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH },
    repository, job: await repository.get('bridge-prep-job'), fetchImpl: movingFetch,
    mentorEngine: { async propose(input) { const answer = await engine.propose(input); head = 'd'.repeat(40); return answer; } },
  }), error => error.code === 'CODE_HEAD_PIN_MISMATCH');
  assert.deepEqual((await repository.get('bridge-prep-job')).files_json, []);
  assert.equal((await repository.get('bridge-prep-job')).status, 'TEACHER_APPROVED');
});

test('re-approved repair reads the exact historical base without treating it as current candidate', async () => {
  const repository = await approvedRepository();
  const previous = await repository.get('bridge-prep-job');
  const base = 'b'.repeat(40);
  await repository.update(previous.id, { result_json: { ...previous.result_json,
    teacher_bridge: { ...previous.result_json.teacher_bridge, reviewed_at: '2026-10-21T22:00:00Z' },
    candidate_ci_failure: { candidate_sha: SHA, base_sha: base },
    dev_bridge: { needs_repair: true, received_at: '2026-10-21T21:00:00Z', tests: [{ name: 'full-candidate-ci', passed: false }] },
  } });
  const calls = [];
  const provider = { id: 'reference-repair', providerId: 'fixture', modelId: 'fixture', async invoke(request) {
    calls.push(request);
    return { text: JSON.stringify({ edits: [{ path: 'src/example.js', find: 'export const ready = false;', replace: 'export const ready = true;\nexport const keep = 1;' }], tests: ['test'] }) };
  } };
  const read = fetchImpl();
  const fetchReference = async url => String(url).includes('raw.githubusercontent.com') && String(url).includes('/' + base + '/')
    ? new Response('export const ready = false;\nexport const keep = 1;\n') : read(url);
  const result = await prepareApprovedBridgePackage({ env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH },
    repository, job: await repository.get(previous.id), fetchImpl: fetchReference,
    mentorEngine: new MentorEngine({ providerFactory: async () => [provider] }),
  });
  assert.equal(result.mentor.mode, 'repair');
  assert.equal(result.candidate_sha, SHA);
  assert.match(calls[0].input, /REFERENCE src\/example.js/);
  assert.match((await repository.get(previous.id)).files_json[0].content, /export const keep = 1/);
  assert.equal((await repository.get(previous.id)).status, 'TEACHER_APPROVED');
});

test('an older cached package cannot bypass export validation or the mandatory full regression', async () => {
  const repository = await approvedRepository();
  const args = { env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH }, repository,
    fetchImpl: fetchImpl(), mentorEngine: mentorEngine([]) };
  await prepareApprovedBridgePackage({ ...args, job: await repository.get('bridge-prep-job') });
  const job = await repository.get('bridge-prep-job');
  await repository.update(job.id, { files_json: [{ path: 'src/example.js', content: 'export const replaced = true;' }] });
  await assert.rejects(prepareApprovedBridgePackage({ ...args, job: await repository.get(job.id) }),
    error => error.code === 'MENTOR_EXPORT_CONTRACT_REMOVED');
  assert.equal((await repository.get(job.id)).status, 'TEACHER_APPROVED');
});

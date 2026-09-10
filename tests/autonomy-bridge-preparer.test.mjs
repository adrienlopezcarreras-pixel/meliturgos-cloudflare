import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { prepareApprovedBridgePackage, normalizeTests } from '../src/evolution/autonomy-bridge-preparer.js';

const SHA = 'cccccccccccccccccccccccccccccccccccccccc';
const BRANCH = 'candidate/augmentio-core';
const REQUEST = 'bridge-prep-request';

async function approvedRepository() {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
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
      return {
        mode: input.mode,
        council: { selected_provider: 'fixture' },
        proposal: {
          summary: 'Turn the inspected file into a tested implementation.',
          changes: [{ path: 'src/example.js', content: 'export const ready = true;\n', reason: 'Implement feature' }],
          tests: ['test:smoke', 'test:integration'],
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
  assert.deepEqual(result.tests, ['test:smoke', 'test:integration']);
  assert.equal(result.production_deploy_allowed, false);
  assert.equal(result.human_release_approval_required, true);
  assert.equal(calls.length, 1);

  const stored = await repository.get('bridge-prep-job');
  assert.equal(stored.status, 'TEACHER_APPROVED');
  assert.equal(stored.files_json[0].path, 'src/example.js');
  assert.match(stored.files_json[0].content, /ready = true/);
  assert.deepEqual(stored.tests_json.map(row => row.command), ['test:smoke', 'test:integration']);
  assert.equal(stored.patch_json.source, 'MentorEngine');
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

test('bridge preparation fails closed on stale candidate or missing Teacher approval', async () => {
  const repository = await approvedRepository();
  const job = await repository.get('bridge-prep-job');
  const staleFetch = async (url) => String(url).includes('/commits/') ? Response.json({ sha: 'dddddddddddddddddddddddddddddddddddddddd' }) : new Response('x');
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
  await assert.rejects(
    () => prepareApprovedBridgePackage({
      env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH },
      repository,
      job: await repository.get(job.id),
      fetchImpl: fetchImpl(),
      mentorEngine: mentorEngine([]),
    }),
    error => error.code === 'TEACHER_APPROVAL_REQUIRED'
  );
});

test('bridge test normalization allows only bounded named scripts', () => {
  assert.deepEqual(normalizeTests(['test:smoke','arbitrary','test:integration','test:smoke']).map(row => row.command), ['test:smoke','test:integration']);
  assert.deepEqual(normalizeTests([]).map(row => row.command), ['test:smoke']);
});

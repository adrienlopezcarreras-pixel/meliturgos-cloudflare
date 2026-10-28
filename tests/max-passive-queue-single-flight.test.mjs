import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { AutonomySupervisor } from '../src/evolution/autonomy-supervisor.js';
import { approveAllWaitingTeachersUnderOwnerMax, mirrorAllWaitingInternalTeachers } from '../src/evolution/autonomy-runtime.js';
import { buildAutonomyActivity } from '../src/evolution/autonomy-activity.js';
import { currentAutonomyRepository } from '../src/evolution/autonomy-runtime-core.js';
import { reconcileRuntimeTeacherReplies } from '../src/teachers/github-reply-reconciler.js';

function waiting(id, created_at) {
  const sha = 'a'.repeat(40);
  return { id, requested_by: 'mel-autonomy', goal: id, created_at, updated_at: created_at,
    status: 'WAITING_TEACHER', optional_context: { source: 'error-ledger' },
    result_json: { teacher_bridge: { status: 'WAITING_TEACHER',
      evidence: { candidate_sha: sha }, request: { request_id: 'req-' + id,
        target_sha: sha, stage: 'TEACHER_REVIEW_REQUIRED',
        candidate: { branch: 'candidate/mel-clean-autonomy', sha },
        provenance: { source: 'MEL_RUNTIME_CRON' } } } } };
}

test('MAX approves only the current internal mission; an existing passive repair is untouched', async () => {
  const jobs = [waiting('manifest', 10), waiting('error-ledger-new', 20)];
  const repo = new D1DevJobRepository(null, { memoryStore: new Map(jobs.map(job => [job.id, job])) });
  const before = structuredClone(await repo.get('error-ledger-new'));
  const result = await approveAllWaitingTeachersUnderOwnerMax(repo);
  assert.deepEqual(result.applied.map(row => row.job_id), ['manifest']);
  assert.deepEqual(await repo.get('error-ledger-new'), before);
});

test('a stale Teacher reply scan cannot requeue the passive mission', async () => {
  const jobs = [waiting('manifest', 10), waiting('error-ledger-new', 20)];
  const repo = new D1DevJobRepository(null, { memoryStore: new Map(jobs.map(job => [job.id, job])) });
  const before = structuredClone(await repo.get('error-ledger-new'));
  await reconcileRuntimeTeacherReplies({
    repository: currentAutonomyRepository(repo, 0, { singleFlight: true }),
    env: { MEL_CANONICAL_CANDIDATE_SHA: 'b'.repeat(40) },
    fetchImpl: async () => new Response(''),
  });
  assert.equal((await repo.get('manifest')).status, 'QUEUED');
  assert.deepEqual(await repo.get('error-ledger-new'), before);
});

test('activity shows the current Teacher stage and a passive repair, including beyond the recent UI window', async () => {
  const jobs = [waiting('manifest', 10), { ...waiting('error-ledger-new', 20), status: 'TEACHER_APPROVED' }];
  const db = { prepare(sql) { const st = { bind() { return st; }, async run() { return {}; }, async all() { return { results: [] }; }, async first() { return sql.startsWith('SELECT status,last_seen,metadata_json FROM dev_bridge_state') ? { status: 'MAX_AUTONOMY', last_seen: 100, metadata_json: JSON.stringify({ paused: false, max_autonomy: true }) } : null; } }; return st; } };
  const result = await buildAutonomyActivity({ DB: db }, { now: 100, repository: {
    list: async () => [jobs[1]], listActiveAutonomyJobs: async () => jobs,
  } });
  assert.equal(result.counts.active, 1);
  assert.equal(result.counts.waiting, 1);
  assert.equal(result.jobs.find(job => job.id === 'manifest').queue_state, 'ACTIVE');
  assert.equal(result.jobs.find(job => job.id === 'error-ledger-new').queue_state, 'WAITING');
});

test('a focused PC or cloud continuation cannot bypass the current internal mission', async () => {
  const jobs = [waiting('manifest', 10), { ...waiting('error-ledger-new', 20), status: 'TEACHER_APPROVED' }];
  const repo = new D1DevJobRepository(null, { memoryStore: new Map(jobs.map(job => [job.id, job])) });
  const result = await new AutonomySupervisor({ repository: repo, roadmap: [], onlyJobId: 'error-ledger-new' }).ensureNextJob();
  assert.equal(result.job, null);
  assert.equal(result.external_progress.status, 'AUTONOMY_SINGLE_FLIGHT_BUSY');
  assert.equal(result.external_progress.job_id, 'manifest');
});

test('Teacher transport does not submit a second passive internal mission', async () => {
  const jobs = [waiting('manifest', 10), waiting('error-ledger-new', 20)];
  const repo = new D1DevJobRepository(null, { memoryStore: new Map(jobs.map(job => [job.id, job])) });
  const result = await mirrorAllWaitingInternalTeachers({ repository: repo, fetchImpl: async () => new Response('', { status: 403 }) });
  assert.equal(result.attempted, 1);
  assert.ok([...result.mirrored, ...result.failed].every(row => row.job_id === 'manifest'));
});

for (const persistent of [false, true]) test(`existing passive repair cannot be claimed by either Bridge (${persistent ? 'SQLite' : 'memory'})`, async () => {
  const db = persistent ? sqliteD1() : null;
  const repo = new D1DevJobRepository(db);
  try {
    // Legacy rows deliberately predate the admission fix: seed two unscoped
    // records, then restore the exact persisted stages observed in the incident.
    const old = await repo.create({ id: 'manifest', requested_by: 'mel-autonomy', goal: 'manifest' });
    const repair = await repo.create({ id: 'repair', requested_by: 'mel-autonomy', goal: 'repair' });
    await repo.update(old.id, { status: 'WAITING_TEACHER', created_at: 10 });
    await repo.update(repair.id, { status: 'TEACHER_APPROVED', created_at: 20,
      files_json: [{ path: 'src/test.js', content: 'export const x = 1;' }],
      tests_json: [{ command: 'npm test' }], result_json: {
        teacher_bridge: { status: 'ANSWERED', request: { request_id: 'req' },
          review: { request_id: 'req', verdict: 'APPROVE_PLAN', development_allowed: true } },
        bridge_preparation: { status: 'READY', teacher_request_id: 'req',
          candidate_branch: 'candidate/mel-clean-autonomy', candidate_sha: 'a'.repeat(40) },
      } });
    const before = await repo.get(repair.id);
    assert.equal(await repo.claimPrepared(repair.id), null);
    assert.equal(await repo.claim(), null);
    assert.deepEqual(await repo.get(repair.id), before);
    await repo.update(old.id, { status: 'CANCELLED' });
    assert.equal((await repo.claimPrepared(repair.id))?.id, repair.id);
  } finally { db?.close(); }
});

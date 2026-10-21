// [Codex] Real disposable SQLite persistence and scheduler recovery; no live
// provider/production result is claimed by these local regressions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { persistVerificationWait } from '../src/evolution/autonomy-runtime-core.js';
import { AutonomySupervisor } from '../src/evolution/autonomy-supervisor.js';
import { reviewVerificationEvidence } from '../src/evolution/council-review.js';

const SHA = 'a'.repeat(40);
async function fixture(t) {
  const DB = sqliteD1();
  t.after(() => DB.close());
  const repository = new D1DevJobRepository(DB);
  const job = await repository.create({ id: 'verify-existing', requested_by: 'mel-autonomy', goal: 'Lire Gmail', optional_context: { roadmap_id: 'MEL-FOUNDER-01' } });
  await repository.update(job.id, { status: 'TEACHER_APPROVED', result_json: {
    implementation_proposal: { status: 'VERIFY_EXISTING', candidate_sha: SHA },
    preserved: 'existing evidence',
  } });
  return { DB, repository, id: job.id };
}

test('missing exact CI or live proof persists a resumable verification, not a failed implementation', async t => {
  const { repository, id } = await fixture(t);
  for (const code of ['FULL_CANDIDATE_CI_REQUIRED', 'VERIFY_EXISTING_LIVE_CHECK_FAILED:drive.files.list:GOOGLE_AUTH_REQUIRED']) {
    const checks = [{ capability: 'drive.files.list', ok: false, code: 'GOOGLE_AUTH_REQUIRED' }];
    await persistVerificationWait(repository, id, { code, candidateSha: SHA, liveChecks: checks });
    const stored = await repository.get(id);
    assert.equal(stored.status, 'TEACHER_APPROVED');
    assert.equal(stored.result_json.verify_existing.status, 'WAITING_VERIFICATION');
    assert.equal(stored.result_json.verify_existing.objective_assessment, 'ALREADY_IMPLEMENTED_UNVERIFIED');
    assert.equal(stored.result_json.verify_existing.code, code);
    assert.deepEqual(stored.result_json.verify_existing.live_checks, checks);
    assert.equal(stored.result_json.preserved, 'existing evidence');
    assert.equal(stored.result_json.autonomy_completion, undefined);
    assert.equal(stored.files_json.length, 0);
  }
});

test('restart admits independent cloud work while the same verification waits, and resumes after expiry', async t => {
  const { repository, id } = await fixture(t);
  const roadmap = [
    { id: 'MEL-FOUNDER-01', title: 'Read Gmail', status: 'IN_PROGRESS', priority: 'P0' },
    { id: 'MEL-FOUNDER-02', title: 'Independent cloud work', status: 'PLANNED', priority: 'P0' },
  ];
  await persistVerificationWait(repository, id, { code: 'FULL_CANDIDATE_CI_REQUIRED' });
  const other = await new AutonomySupervisor({ repository, roadmap }).ensureNextJob();
  assert.equal(other.job.optional_context.roadmap_id, 'MEL-FOUNDER-02');
  await repository.update(other.job.id, { status: 'CANCELLED' });
  await persistVerificationWait(repository, id, { code: 'FULL_CANDIDATE_CI_REQUIRED', now: Date.now() - 6 * 60_000 });
  const resumed = await new AutonomySupervisor({ repository, roadmap }).ensureNextJob();
  assert.equal(resumed.job.id, id);
});

test('verification waits never revive terminal jobs or reclaim externally executing work', async t => {
  const { repository, id } = await fixture(t);
  for (const status of ['FAILED', 'CANCELLED', 'COMPLETED', 'CLAIMED', 'READY_FOR_REVIEW']) {
    await repository.update(id, { status });
    const before = await repository.get(id);
    await persistVerificationWait(repository, id, { code: 'COUNCIL_UNAVAILABLE' });
    assert.deepEqual(await repository.get(id), before);
  }
});

test('a concurrent result cannot be overwritten by an older verification snapshot', async t => {
  const { repository, id } = await fixture(t);
  const concurrent = {
    get: repository.get.bind(repository),
    async update(jobId, patch, options) {
      await repository.update(jobId, { status: 'CANCELLED', error: 'OWNER_CANCELLED' });
      return repository.update(jobId, patch, options);
    },
  };
  await persistVerificationWait(concurrent, id, { code: 'COUNCIL_UNAVAILABLE' });
  assert.equal((await repository.get(id)).status, 'CANCELLED');
  assert.equal((await repository.get(id)).error, 'OWNER_CANCELLED');
});

for (const decision of ['COUNCIL_UNAVAILABLE', 'INSUFFICIENT_REVIEWERS']) test(`real review persistence retains an unavailable verification for retry: ${decision}`, async t => {
  const { DB, repository, id } = await fixture(t);
  const result = await reviewVerificationEvidence({ DB }, {
    job: await repository.get(id), implementation: { candidate_sha: SHA }, ciRunId: 4242,
    review: async () => ({ decision, reviews: [] }),
  });
  assert.equal(result.decision, decision);
  assert.equal((await repository.get(id)).status, 'TEACHER_APPROVED');
  await persistVerificationWait(repository, id, { code: result.decision, ciRunId: 4242, candidateSha: SHA });
  assert.equal((await repository.get(id)).result_json.verify_existing.status, 'WAITING_VERIFICATION');
  const persisted = await DB.prepare('SELECT status FROM dev_bridge_state WHERE bridge_id=?').bind(`council-review:verify:${id}:${SHA}`).first();
  assert.equal(persisted.status, decision);
});

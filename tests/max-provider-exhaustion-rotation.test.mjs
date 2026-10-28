import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { AutonomySupervisor, providerRetryContext } from '../src/evolution/autonomy-supervisor.js';
import { isRotatableProviderExhaustion } from '../src/evolution/provider-exhaustion-rotation.js';

const roadmap = [
  { id: 'MEL-MANIFEST-01', title: 'Provider blocked roadmap', status: 'PLANNED', priority: 'P0' },
  { id: 'MEL-MANIFEST-02', title: 'Next independent roadmap', status: 'PLANNED', priority: 'P0' },
  { id: 'MEL-MANIFEST-03', title: 'Third independent roadmap', status: 'PLANNED', priority: 'P0' },
];

async function setup(repository, { attempts = 3, context = true, status = 'TEACHER_APPROVED', maxAttempts = 3 } = {}) {
  const original = await repository.create({ id: 'mel-autonomy-mel-manifest-01-1',
    requested_by: 'mel-autonomy', goal: '[MEL-MANIFEST-01] First objective',
    optional_context: { roadmap_id: 'MEL-MANIFEST-01', source: 'autonomy-supervisor' } });
  await repository.update(original.id, { status, result_json: { implementation_proposal: { candidate_sha: 'a'.repeat(40) } } });
  const job = await repository.get(original.id);
  await repository.update(job.id, { result_json: {
    ...job.result_json, autonomy_deferral: {
      phase: 'implementation', code: 'MENTOR_PROVIDER_TIMEOUT', exhausted: true,
      attempts, max_attempts: maxAttempts, retry_after: Date.now() + 300_000,
      ...(context ? { context: providerRetryContext(job) } : {}),
    },
  } });
  return original.id;
}

for (const storage of ['memory', 'sqlite']) test(`provider exhaustion rotates safely on ${storage} while retaining D1 single flight`, async t => {
  const DB = storage === 'sqlite' ? sqliteD1() : null;
  if (DB) t.after(() => DB.close());
  const repository = new D1DevJobRepository(DB, { memoryStore: new Map() });
  const parkedId = await setup(repository);
  assert.equal(isRotatableProviderExhaustion(await repository.get(parkedId)), true);
  const supervisor = new AutonomySupervisor({ repository, roadmap });
  const next = await supervisor.ensureNextJob();
  assert.equal(next.created, true);
  assert.equal(next.job.optional_context.roadmap_id, 'MEL-MANIFEST-02');
  assert.equal((await repository.get(parkedId)).status, 'TEACHER_APPROVED');
  assert.equal((await repository.get(parkedId)).result_json.autonomy_deferral.attempts, 3);
  assert.equal((await supervisor.ensureNextJob()).job.id, next.job.id);
  await assert.rejects(
    () => repository.create({ id: 'mel-autonomy-mel-manifest-03-manual',
      requested_by: 'mel-autonomy', goal: 'Third objective',
      optional_context: { roadmap_id: 'MEL-MANIFEST-03' } }),
    { code: 'AUTONOMY_OBJECTIVE_ALREADY_ACTIVE' },
  );
  await assert.rejects(
    () => repository.create({ id: 'mel-autonomy-mel-manifest-01-duplicate',
      requested_by: 'mel-autonomy', goal: 'Duplicate exhausted objective',
      optional_context: { roadmap_id: 'MEL-MANIFEST-01' } }),
    { code: 'AUTONOMY_OBJECTIVE_ALREADY_ACTIVE' },
  );
  const parked = await repository.get(parkedId);
  await repository.update(parkedId, { result_json: {
    ...parked.result_json, implementation_proposal: { candidate_sha: 'b'.repeat(40) },
  } });
  assert.equal(isRotatableProviderExhaustion(await repository.get(parkedId)), false,
    'a changed candidate SHA must re-enable the original admission fence');
});

for (const invalid of [
  { attempts: 2 },
  { maxAttempts: 1 },
  { context: false },
  { status: 'CLAIMED' },
]) test(`unsafe provider exhaustion marker cannot free the lane: ${JSON.stringify(invalid)}`, async t => {
  const DB = sqliteD1();
  t.after(() => DB.close());
  const repository = new D1DevJobRepository(DB);
  const id = await setup(repository, invalid);
  assert.equal(isRotatableProviderExhaustion(await repository.get(id)), false);
  const supervisor = new AutonomySupervisor({ repository, roadmap });
  const pending = await supervisor.ensureNextJob();
  assert.equal(pending.job, null);
  assert.equal(pending.external_progress?.job_id, id);
  assert.equal((await repository.list()).length, 1);
});

test('two competing D1 supervisors still admit only one replacement after provider exhaustion', async t => {
  const DB = sqliteD1();
  t.after(() => DB.close());
  const repository = new D1DevJobRepository(DB);
  await setup(repository);
  const [a, b] = await Promise.all([
    new AutonomySupervisor({ repository, roadmap }).ensureNextJob(),
    new AutonomySupervisor({ repository, roadmap }).ensureNextJob(),
  ]);
  assert.equal(a.job.id, b.job.id);
  assert.deepEqual([a.created, b.created].sort(), [false, true]);
  assert.equal((await repository.list()).filter(job =>
    job.requested_by === 'mel-autonomy' && job.optional_context.roadmap_id === 'MEL-MANIFEST-02').length, 1);
});

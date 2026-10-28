import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { AutonomySupervisor, providerRetryContext } from '../src/evolution/autonomy-supervisor.js';
import { isRotatableProviderExhaustion, boundedCouncilDeferral, activeAutonomyMission } from '../src/evolution/provider-exhaustion-rotation.js';

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
  { attempts: 3, maxAttempts: 4 },
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

test('D1 NULL deferral never bypasses the atomic admission fence', async t => {
  const DB = sqliteD1();
  t.after(() => DB.close());
  const repository = new D1DevJobRepository(DB);
  await repository.create({ id: 'active-without-deferral', requested_by: 'mel-autonomy',
    goal: 'Running a real roadmap item', optional_context: { roadmap_id: 'MEL-MANIFEST-01' } });
  await assert.rejects(() => repository.create({
    id: 'must-not-run-parallel', requested_by: 'mel-autonomy',
    goal: 'Second job', optional_context: { roadmap_id: 'MEL-MANIFEST-02' },
  }), { code: 'AUTONOMY_OBJECTIVE_ALREADY_ACTIVE' });
});

for (const storage of ['memory', 'sqlite']) test(`Council cooldown polling never spends an extra attempt, but three distinct review windows rotate on ${storage}`, async t => {
  const DB = storage === 'sqlite' ? sqliteD1() : null;
  if (DB) t.after(() => DB.close());
  const repository = new D1DevJobRepository(DB, { memoryStore: new Map() });
  const original = await repository.create({ id: 'council-mel-manifest-01',
    requested_by: 'mel-autonomy', goal: '[MEL-MANIFEST-01] Council unavailable',
    optional_context: { roadmap_id: 'MEL-MANIFEST-01', source: 'autonomy-supervisor' } });
  let clock = 1792749000000;
  for (let round = 1; round <= 3; round++) {
    let current = await repository.get(original.id);
    const failure = boundedCouncilDeferral({ job: current,
      deferred: { code: 'COUNCIL_INSUFFICIENT_RESPONSES', observed_at: clock },
      retryAt: clock + 300_000, now: clock,
      freshAttempts: [{ provider_id: 'workers-ai:test', status: 'TIMEOUT' }],
    });
    await repository.update(original.id, { result_json: { ...current.result_json, autonomy_deferral: failure } });
    current = await repository.get(original.id);
    const cooldown = boundedCouncilDeferral({ job: current,
      deferred: { code: 'COUNCIL_PROVIDER_COOLDOWN_PENDING', observed_at: clock + 1000 },
      retryAt: clock + 500_000, now: clock + 1000, freshAttempts: [] });
    assert.equal(cooldown.attempts, round, 'polling within the same retry window is not a new attempt');
    assert.equal(cooldown.retry_after, failure.retry_after, 'polling cannot postpone the authorized retry');
    await repository.update(original.id, { result_json: { ...current.result_json, autonomy_deferral: cooldown } });
    assert.equal(isRotatableProviderExhaustion(await repository.get(original.id)), round === 3);
    clock += 300_001;
  }
  const supervisor = new AutonomySupervisor({ repository, roadmap });
  const next = await supervisor.ensureNextJob();
  assert.equal(next.created, true);
  assert.equal(next.job.optional_context.roadmap_id, 'MEL-MANIFEST-02');
  assert.equal((await repository.get(original.id)).result_json.autonomy_deferral.attempts, 3);
});

for (const storage of ['memory', 'sqlite']) test(`Council with no eligible providers rotates only after 3 distinct retry windows on ${storage}`, async t => {
  const DB = storage === 'sqlite' ? sqliteD1() : null;
  if (DB) t.after(() => DB.close());
  const repository = new D1DevJobRepository(DB, { memoryStore: new Map() });
  const original = await repository.create({ id: 'council-no-provider',
    requested_by: 'mel-autonomy', goal: '[MEL-MANIFEST-01] Waiting for Council',
    optional_context: { roadmap_id: 'MEL-MANIFEST-01', source: 'autonomy-supervisor' } });
  let clock = 1792749000000;
  for (let round = 1; round <= 3; round++) {
    const current = await repository.get(original.id);
    const noProvider = boundedCouncilDeferral({ job: current,
      deferred: { code: 'COUNCIL_PROVIDER_COOLDOWN_PENDING', observed_at: clock },
      retryAt: clock + 300_000, now: clock, freshAttempts: [] });
    assert.equal(noProvider.attempts, round);
    assert.equal(noProvider.last_round, 'NO_ELIGIBLE_PROVIDER_WINDOW');
    await repository.update(original.id, { result_json: { ...current.result_json, autonomy_deferral: noProvider } });
    const within = boundedCouncilDeferral({ job: await repository.get(original.id),
      deferred: { code: 'COUNCIL_PROVIDER_COOLDOWN_PENDING' },
      retryAt: clock + 600_000, now: clock + 1000, freshAttempts: [] });
    assert.equal(within.attempts, round);
    assert.equal(within.retry_after, noProvider.retry_after);
    assert.equal(isRotatableProviderExhaustion(await repository.get(original.id)), round === 3);
    clock += 300_001;
  }
  const next = await new AutonomySupervisor({ repository, roadmap }).ensureNextJob();
  assert.equal(next.created, true);
  assert.equal(next.job.optional_context.roadmap_id, 'MEL-MANIFEST-02');
  const preserved = await repository.get(original.id);
  assert.equal(preserved.status, 'QUEUED');
  assert.equal(preserved.result_json.autonomy_deferral.attempts, 3);
});
for (const storage of ['memory', 'sqlite']) test(`changed parked context cannot preempt live rotated successor on ${storage}`, async t => {
  const DB = storage === 'sqlite' ? sqliteD1() : null;
  if (DB) t.after(() => DB.close());
  const repository = new D1DevJobRepository(DB, { memoryStore: new Map() });
  const firstId = await setup(repository);
  const supervisor = new AutonomySupervisor({ repository, roadmap });
  const replacement = await supervisor.ensureNextJob();
  assert.equal(replacement.created, true);
  assert.equal(replacement.job.optional_context.roadmap_id, 'MEL-MANIFEST-02');

  const previous = await repository.get(firstId);
  await repository.update(firstId, { result_json: {
    ...previous.result_json,
    implementation_proposal: { candidate_sha: 'b'.repeat(40) },
  } });
  assert.equal(isRotatableProviderExhaustion(await repository.get(firstId)), false,
    'a new approval context makes the parked job eligible again only after its successor');
  const selected = await supervisor.ensureNextJob();
  assert.equal(selected.job.id, replacement.job.id,
    'the current slot holder must remain selected despite the older approved mission');
  assert.equal((await repository.list()).length, 2);

  await repository.update(replacement.job.id, { status: 'COMPLETED' });
  const resumed = await supervisor.ensureNextJob();
  assert.equal(resumed.created, false);
  assert.equal(resumed.job.id, firstId,
    'changed-context original resumes only after its replacement leaves the active set');
});

for (const storage of ['memory', 'sqlite']) test(`bounded cloud policy reopens an old Council once and retains single flight on ${storage}`, async t => {
  const DB = storage === 'sqlite' ? sqliteD1() : null;
  if (DB) t.after(() => DB.close());
  const repository = new D1DevJobRepository(DB, { memoryStore: new Map() });
  const original = await repository.create({ id: 'old-unbounded-council', requested_by: 'mel-autonomy',
    goal: '[MEL-MANIFEST-01] Recover bounded Cloud review', optional_context: { roadmap_id: 'MEL-MANIFEST-01' } });
  const old = { code: 'COUNCIL_INSUFFICIENT_RESPONSES', phase: 'council', context: providerRetryContext(original),
    attempts: 3, max_attempts: 3, exhausted: true, retry_after: Date.now() + 600_000 };
  await repository.update(original.id, { result_json: { autonomy_deferral: old } });
  assert.equal(isRotatableProviderExhaustion(await repository.get(original.id)), false);
  await assert.rejects(() => repository.create({ id: 'parallel-mission', requested_by: 'mel-autonomy',
    goal: '[MEL-MANIFEST-02] Must wait', optional_context: { roadmap_id: 'MEL-MANIFEST-02' } }),
  { code: 'AUTONOMY_OBJECTIVE_ALREADY_ACTIVE' });
  const supervisor = new AutonomySupervisor({ repository, roadmap });
  const resumed = await supervisor.ensureNextJob();
  assert.equal(resumed.job.id, original.id);
  const now = Date.now();
  const first = boundedCouncilDeferral({ job: resumed.job, deferred: { code: old.code }, retryAt: now + 300_000, now });
  assert.equal(first.attempts, 1);assert.equal(first.exhausted, false);
  await repository.update(original.id, { result_json: { autonomy_deferral: first } });
  const repeated = boundedCouncilDeferral({ job: await repository.get(original.id), deferred: { code: old.code }, retryAt: now + 300_001, now: now + 1 });
  assert.equal(repeated.attempts, 1, 'the new policy is persisted; heartbeat/redeploy cannot replenish attempts');
  assert.equal((await supervisor.ensureNextJob()).job, null, 'current policy cooldown is still enforced');
});


test('one activity slot excludes all demoted waiting missions without deleting their proofs', () => {
  const jobs = Array.from({length:15},(_,i)=>({id:'j'+i,requested_by:'mel-autonomy',status:'QUEUED',created_at:i,
    result_json:{autonomy_deferral:{phase:'implementation',exhausted:true,attempts:3,max_attempts:3,context:providerRetryContext({}),priority_penalty:1}}}));
  assert.equal(activeAutonomyMission(jobs),null);
  const next={id:'new',requested_by:'mel-autonomy',status:'QUEUED',created_at:20,result_json:{}};
  assert.equal(activeAutonomyMission([...jobs,next]), null, 'a fresh QUEUED mission remains passive until claimed');
  assert.equal([...jobs,next].filter(job => job.status === 'QUEUED').length, 16);
  assert.equal(jobs.length,15);assert.equal(jobs[0].result_json.autonomy_deferral.attempts,3);
});

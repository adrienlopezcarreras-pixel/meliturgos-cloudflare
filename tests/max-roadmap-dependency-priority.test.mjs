import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { AutonomySupervisor, selectActionableAutonomyJob, selectNextAutonomyItem } from '../src/evolution/autonomy-supervisor.js';
import { flattenRoadmap, validateRoadmap, getRoadmapPayload } from '../src/roadmap/master-roadmap.js';
import { unmetRoadmapPrerequisites, validateRoadmapDependencies, validateRoadmapTechnicalWork } from '../src/roadmap/roadmap-dependencies.js';

const roadmap = [
  { id: 'TEST-FOUNDATION', title: 'Deliver tested foundation', priority: 'P0', status: 'PLANNED', next: 'implement then test', depends_on: [] },
  { id: 'TEST-CHILD', title: 'Verify the foundation', priority: 'P0', status: 'PLANNED', next: 'run executable evidence', depends_on: ['TEST-FOUNDATION'] },
  { id: 'TEST-UNRELATED', title: 'Independent task', priority: 'P1', status: 'PLANNED', next: 'run local test', depends_on: [] },
];

test('all canonical roadmap edges reference existing IDs and never form cycles', () => {
  const items = flattenRoadmap();
  assert.equal(validateRoadmap().ok, true, JSON.stringify(validateRoadmap().issues));
  assert.deepEqual(validateRoadmapDependencies(items), []);
  assert.deepEqual(validateRoadmapTechnicalWork(items), []);
  const open = items.filter(row => row.status !== 'DONE_VERIFIED');
  assert.equal(open.length, 43);
  assert.equal(open.filter(row => ['IMPLEMENT','FIX','VERIFY'].includes(row.mode)).length, 38);
  assert.equal(open.filter(row => row.mode === 'EXTERNAL').length, 5);
  assert.ok(open.every(row => row.required_proof), 'every open roadmap item has an acceptance contract');
  const promoted = items.map(row => row.id === 'MEL-FOUNDER-06'
    ? { ...row, status: 'DONE_VERIFIED' } : row);
  assert.deepEqual(validateRoadmapTechnicalWork(promoted), [],
    'when a formerly external mission is truly verified, its immutable contract stays valid');
  const serialized = getRoadmapPayload().phases.flatMap(phase => phase.items);
  assert.equal(serialized.find(row => row.id === 'MEL-MANIFEST-03').mode, 'VERIFY');
  assert.deepEqual(serialized.find(row => row.id === 'MEL-MANIFEST-03').depends_on,
    ['MEL-FOUNDER-03','MEL-FOUNDER-04']);
  const manifest = items.find(item => item.id === 'MEL-MANIFEST-01');
  assert.deepEqual(manifest.depends_on, [],
    'MANIFEST-01 may account for pending founder states before they are verified');
  assert.ok(!items.find(item => item.id === 'MEL-FOUNDER-06').depends_on.length,
    'paused hardware must not be added as a cloud dependency');
  assert.deepEqual(unmetRoadmapPrerequisites(manifest, items), []);
  const closure = items.find(item => item.id === 'MEL-MANIFEST-10');
  assert.ok(unmetRoadmapPrerequisites(closure, items).length >= 4,
    'final manifesto closure still requires verified cloud foundations');
});

test('dependency validator rejects cycles, missing nodes and self edges', () => {
  const broken = [
    { id: 'A', depends_on: ['B', 'UNKNOWN'] },
    { id: 'B', depends_on: ['A'] },
    { id: 'C', depends_on: ['C'] },
  ];
  const kinds = validateRoadmapDependencies(broken).map(item => item.type);
  assert.ok(kinds.includes('ROADMAP_DEPENDENCY_CYCLE'));
  assert.ok(kinds.includes('ROADMAP_MISSING_DEPENDENCY'));
  assert.ok(kinds.includes('ROADMAP_SELF_DEPENDENCY'));
});

test('priority never overrides unmet prerequisites or owner-blocked status', () => {
  const onlyWaiting = roadmap.filter(item => item.id !== 'TEST-FOUNDATION');
  assert.equal(selectNextAutonomyItem({ roadmap: onlyWaiting }).id, 'TEST-UNRELATED');
  assert.equal(selectNextAutonomyItem({ roadmap }).id, 'TEST-FOUNDATION');
  assert.equal(selectNextAutonomyItem({ roadmap, completedIds: ['TEST-FOUNDATION'] }).id, 'TEST-UNRELATED',
    'a completed delivery alone cannot unlock its child');
  assert.equal(selectNextAutonomyItem({ roadmap, completedIds: ['TEST-FOUNDATION'], verifiedIds: ['TEST-FOUNDATION'] }).id, 'TEST-CHILD');
  assert.equal(selectNextAutonomyItem({ roadmap: [
    { id: 'HARDWARE', status: 'BLOCKED_HUMAN', priority: 'P0', depends_on: [] },
    ...roadmap,
  ] }).id, 'TEST-FOUNDATION');
});

for (const storage of ['memory', 'sqlite']) {
  test(`blocked approved mission waits without taking an execution slot and resumes only after proven dependency (${storage})`, async t => {
    const db = storage === 'sqlite' ? sqliteD1() : null;
    if (db) t.after(() => db.close());
    const repository = new D1DevJobRepository(db, { memoryStore: new Map() });
    const former = await repository.create({
      id: 'mel-autonomy-test-child-existing',
      goal: '[TEST-CHILD] Existing Teacher-approved job',
      requested_by: 'mel-autonomy',
      optional_context: { roadmap_id: 'TEST-CHILD', source: 'autonomy-supervisor' },
    });
    await repository.update(former.id, { status: 'TEACHER_APPROVED' });
    const localRoadmap = roadmap.map(item => ({ ...item, depends_on: [...item.depends_on] }));
    const supervisor = new AutonomySupervisor({ repository, roadmap: localRoadmap });
    const first = await supervisor.ensureNextJob();
    assert.equal(first.created, true);
    assert.equal(first.job.optional_context.roadmap_id, 'TEST-FOUNDATION');
    const parked = await repository.get(former.id);
    assert.equal(parked.status, 'WAITING_DEPENDENCY');
    assert.deepEqual(parked.result_json.dependency_wait.prerequisites, ['TEST-FOUNDATION']);
    assert.equal(parked.result_json.dependency_wait.previous_status, 'TEACHER_APPROVED');
    // A direct executor cannot override the dependency guard.
    const targeted = await new AutonomySupervisor({ repository, roadmap: localRoadmap, onlyJobId: former.id }).ensureNextJob();
    assert.equal(targeted.job, null);
    // A paused job is part of the durable ledger, but cannot be created twice.
    const duplicate = await repository.createIfAbsent({
      id: 'another-test-child', goal: 'Duplicate',
      requested_by: 'mel-autonomy',
      optional_context: { roadmap_id: 'TEST-CHILD', source: 'autonomy-supervisor' },
    });
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.job.id, former.id);
    const again = await supervisor.ensureNextJob();
    assert.equal(again.job.id, first.job.id);
    await repository.update(first.job.id, { status: 'COMPLETED' });
    // A job being COMPLETED proves only its delivery, not canonical acceptance.
    const beforeVerified = await supervisor.ensureNextJob();
    assert.equal(beforeVerified.job.optional_context.roadmap_id, 'TEST-UNRELATED');
    assert.equal((await repository.get(former.id)).status, 'WAITING_DEPENDENCY');
    await repository.update(beforeVerified.job.id, { status: 'COMPLETED' });
    localRoadmap[0].status = 'DONE_VERIFIED'; // simulated, separately verified objective acceptance
    const resumed = await supervisor.ensureNextJob();
    assert.equal(resumed.created, false);
    assert.equal(resumed.job.id, former.id);
    assert.equal(resumed.job.status, 'TEACHER_APPROVED');
    assert.equal(resumed.job.result_json.dependency_wait, undefined);
    assert.equal((await repository.list()).length, 3, 'two independent objectives and one resumed original');
  });

  test(`an occupied execution slot prevents resuming a waiting mission (${storage})`, async t => {
    const db = storage === 'sqlite' ? sqliteD1() : null;
    if (db) t.after(() => db.close());
    const repository = new D1DevJobRepository(db, { memoryStore: new Map() });
    const blocked = await repository.create({ id: 'waiter', requested_by: 'mel-autonomy', goal: 'wait',
      optional_context: { roadmap_id: 'TEST-CHILD' } });
    await repository.update(blocked.id, { status: 'WAITING_DEPENDENCY', result_json: {
      dependency_wait: { previous_status: 'QUEUED', prerequisites: ['TEST-FOUNDATION'] },
    } });
    const active = await repository.create({ id: 'active', requested_by: 'mel-autonomy', goal: 'independent',
      optional_context: { roadmap_id: 'TEST-FOUNDATION' } });
    assert.equal(await repository.resumeWaitingDependency(blocked.id), null);
    assert.equal((await repository.get(blocked.id)).status, 'WAITING_DEPENDENCY');
    await repository.update(active.id, { status: 'COMPLETED' });
    const resumed = await repository.resumeWaitingDependency(blocked.id);
    assert.equal(resumed.status, 'QUEUED');
  });
}

test('owner clearing the MAX list cancels dependency waits and starts a fresh prioritized epoch', async t => {
  const { resetAutonomyActivityList, readActivityListEpoch } =
    await import('../src/evolution/autonomy-activity.js');
  const db = sqliteD1();
  t.after(() => db.close());
  const repository = new D1DevJobRepository(db);
  const old = await repository.create({
    id: 'old-dependency-wait-before-owner-clear',
    goal: 'historical blocked objective',
    requested_by: 'mel-autonomy',
    optional_context: { roadmap_id: 'TEST-CHILD' },
  });
  await repository.update(old.id, {
    status: 'WAITING_DEPENDENCY',
    result_json: { dependency_wait: {
      previous_status: 'TEACHER_APPROVED', prerequisites: ['TEST-FOUNDATION'],
    } },
  });
  const verified = await repository.create({
    id: 'completed-and-verified-before-clear',
    goal: 'historical acceptance proof',
    requested_by: 'mel-autonomy',
    optional_context: { roadmap_id: 'TEST-VERIFIED-HISTORY' },
  });
  await repository.update(verified.id, { status: 'DONE_VERIFIED' });
  const reset = await resetAutonomyActivityList(db);
  assert.equal((await repository.get(verified.id)).status, 'DONE_VERIFIED',
    'clearing the queue must not destroy previously verified execution evidence');
  assert.equal(reset.ok, true);
  assert.ok(reset.cancelled_active >= 1);
  assert.equal(await readActivityListEpoch(db), reset.epoch);
  assert.equal((await repository.get(old.id)).status, 'CANCELLED');
  // A manual reset is not proof of roadmap acceptance and does not enable MAX.
  const supervisor = new AutonomySupervisor({ repository, roadmap, epochMs: reset.epoch });
  const fresh = await supervisor.ensureNextJob();
  assert.equal(fresh.created, true);
  assert.equal(fresh.job.optional_context.roadmap_id, 'TEST-FOUNDATION');
  assert.notEqual(fresh.job.id, old.id);
  assert.equal((await repository.get(old.id)).status, 'CANCELLED');
  assert.equal((await repository.list()).length, 3);
});

test('no runnable work is not a 100 % certificate while external tasks remain', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const supervisor = new AutonomySupervisor({
    repository, roadmap: [{ id: 'DEVICE', status: 'BLOCKED_HUMAN', priority: 'P1', depends_on: [] }],
  });
  const result = await supervisor.ensureNextJob();
  assert.equal(result.job, null);
  assert.equal(result.created, false);
  assert.equal(result.complete, false);
  assert.equal(result.external_progress?.status, 'ROADMAP_OBJECTIVES_UNVERIFIED');
  assert.equal(result.external_progress?.remaining_count, 1);
});

test('dependency-only queue does not falsely finish or bypass a blocked prerequisite', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const blockedRoadmap = [
    { id: 'BLOCK', status: 'BLOCKED_EXTERNAL', priority: 'P0', depends_on: [] },
    { id: 'CHILD', status: 'PLANNED', priority: 'P0', depends_on: ['BLOCK'] },
  ];
  const old = await repository.create({
    id: 'wait-dependency', requested_by: 'mel-autonomy',
    goal: 'dependent mission', optional_context: { roadmap_id: 'CHILD' },
  });
  await repository.update(old.id, { status: 'WAITING_DEPENDENCY',
    result_json: { dependency_wait: { previous_status: 'QUEUED', prerequisites: ['BLOCK'] } } });
  const supervisor = new AutonomySupervisor({ repository, roadmap: blockedRoadmap });
  const result = await supervisor.ensureNextJob();
  assert.equal(result.complete, false);
  assert.equal(result.job, null);
  assert.equal(result.external_progress?.status, 'ROADMAP_PREREQUISITES_PENDING');
  assert.equal(result.external_progress?.job_id, old.id);
  assert.equal((await repository.get(old.id)).status, 'WAITING_DEPENDENCY');
});

test('only actually verified and exhausted roadmap can report complete', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const supervisor = new AutonomySupervisor({ repository, roadmap: [
    { id: 'PROVEN', status: 'DONE_VERIFIED', priority: 'P0', depends_on: [] },
  ] });
  const result = await supervisor.ensureNextJob();
  assert.equal(result.created, false);
  assert.equal(result.complete, true);
});

test('an explicit actionability selector never exposes a waiting prerequisite to the LLM', () => {
  const jobs = [{ id: 'job-child', status: 'QUEUED', requested_by: 'mel-autonomy',
    optional_context: { roadmap_id: 'TEST-CHILD' } }];
  assert.equal(selectActionableAutonomyJob(jobs, { roadmap }), null);
  assert.equal(selectActionableAutonomyJob(jobs, { roadmap, completedIds: ['TEST-FOUNDATION'],
    verifiedIds: [] }), null, 'COMPLETED without acceptance cannot satisfy a dependency');
  assert.equal(selectActionableAutonomyJob(jobs, { roadmap, verifiedIds: ['TEST-FOUNDATION'] }).id, 'job-child');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { AutonomySupervisor, selectActionableAutonomyJob, selectActionableAutonomyJobs } from '../src/evolution/autonomy-supervisor.js';

function repo() {
  return new D1DevJobRepository(null, { memoryStore: new Map() });
}

const roadmap = [
  { id: 'GEN2-18', title: 'Independent objective', status: 'PLANNED', priority: 'P0', next: 'separate work' },
  { id: 'GEN2-17', title: 'Dev Agent', status: 'PLANNED', priority: 'P0', next: 'controlled self-development', phase_id: 'P06', phase: 'Evolution' },
];

test('an approved internal implementation outranks an owner job that is only in preflight', async () => {
  const repository = repo();
  const owner = await repository.create({
    id: 'owner-preflight',
    requested_by: 'owner-chat',
    goal: 'owner request still preparing review',
    optional_context: { source: 'owner-chat', priority: 'P0' },
  });
  await repository.update(owner.id, { status: 'CLAIMED' });

  const internal = await repository.create({
    id: 'mel-autonomy-gen2-17-1',
    requested_by: 'mel-autonomy',
    goal: '[GEN2-17] Dev Agent',
    optional_context: { roadmap_id: 'GEN2-17', source: 'autonomy-supervisor', priority: 'P0' },
  });
  await repository.update(internal.id, { status: 'TEACHER_APPROVED' });

  const supervisor = new AutonomySupervisor({ repository, roadmap });
  const selected = await supervisor.ensureNextJob();

  assert.equal(selected.job.id, internal.id);
  assert.equal(selected.job.status, 'TEACHER_APPROVED');
  assert.equal((await repository.get(owner.id)).status, 'CLAIMED');
});

test('roadmap priority remains absolute when both jobs are implementation-ready', async () => {
  const repository = repo();
  const internal = await repository.create({
    id: 'mel-autonomy-gen2-17-1',
    requested_by: 'mel-autonomy',
    goal: '[GEN2-17] Dev Agent',
    optional_context: { roadmap_id: 'GEN2-17', source: 'autonomy-supervisor', priority: 'P0' },
  });
  await repository.update(internal.id, { status: 'TEACHER_APPROVED' });

  const owner = await repository.create({
    id: 'owner-approved',
    requested_by: 'owner-chat',
    goal: 'owner approved work',
    optional_context: { source: 'owner-chat', priority: 'P0' },
  });
  await repository.update(owner.id, { status: 'TEACHER_APPROVED' });

  const supervisor = new AutonomySupervisor({ repository, roadmap });
  const selected = await supervisor.ensureNextJob();

  assert.equal(selected.job.id, internal.id);
  assert.equal(selected.job.requested_by, 'mel-autonomy');
});


test('shared actionable selector matches supervisor ordering for retry attribution', async () => {
  const repository = repo();
  const olderPreflight = await repository.create({
    id: 'older-preflight',
    requested_by: 'mel-autonomy',
    goal: 'older council work',
    optional_context: { roadmap_id: 'GEN2-17', source: 'autonomy-supervisor', priority: 'P0' },
  });
  await repository.update(olderPreflight.id, { status: 'COUNCIL_COMPLETE' });

  // Simulate a legacy snapshot that predates atomic single-flight admission.
  // Current repository.create() must refuse a second active internal mission.
  const approved = { ...olderPreflight,
    id: 'approved-implementation',
    job_id: 'approved-implementation',
    goal: 'approved implementation',
    status: 'TEACHER_APPROVED',
    created_at: Number(olderPreflight.created_at) + 100,
    optional_context: { roadmap_id: 'GEN2-18', source: 'autonomy-supervisor', priority: 'P0' },
  };
  repository.memory.set(approved.id, approved);

  const jobs = await repository.list();
  const selected = selectActionableAutonomyJob(jobs, { roadmap });
  assert.equal(selected.id, approved.id);

  const supervisor = new AutonomySupervisor({ repository, roadmap });
  const ensured = await supervisor.ensureNextJob();
  // The standalone selector prefers the approved job, but single-flight
  // supervision must retain the oldest unfinished mission.
  assert.equal(ensured.job.id, olderPreflight.id);
});


test('REPAIR_REQUIRED approved work is actionable and outranks unrelated approved work by age', async () => {
  const repository = repo();
  const repair = await repository.create({
    id: 'repair-required-old',
    requested_by: 'mel-autonomy',
    goal: 'retry exact approved package',
    optional_context: { roadmap_id: 'GEN2-17', source: 'autonomy-supervisor', priority: 'P0' },
  });
  await repository.update(repair.id, {
    status: 'REPAIR_REQUIRED',
    result_json: {
      teacher_bridge: {
        status: 'ANSWERED',
        request: { request_id: 'teacher-repair' },
        review: { request_id: 'teacher-repair', verdict: 'APPROVE_PLAN', development_allowed: true },
      },
      bridge_preparation: { status: 'READY' },
      dev_bridge: { status: 'REPAIR_REQUIRED', needs_repair: true },
    },
  });

  const other = { ...repair,
    id: 'approved-newer',
    job_id: 'approved-newer',
    goal: 'other approved work',
    status: 'TEACHER_APPROVED',
    created_at: Number(repair.created_at) + 100,
    result_json: null,
    optional_context: { roadmap_id: 'GEN2-18', source: 'autonomy-supervisor', priority: 'P0' },
  };
  repository.memory.set(other.id, other);

  const selected = selectActionableAutonomyJob(await repository.list(), { roadmap });
  assert.equal(selected.id, repair.id);
  assert.equal(selected.status, 'REPAIR_REQUIRED');
});

test('jobs created before the activity epoch are ignored by the selector', () => {
  const old = {
    id: 'old-job',
    requested_by: 'mel-autonomy',
    status: 'QUEUED',
    created_at: 1000,
    optional_context: { roadmap_id: 'GEN2-17' },
  };
  const fresh = {
    id: 'fresh-job',
    requested_by: 'mel-autonomy',
    status: 'QUEUED',
    created_at: 5000,
    optional_context: { roadmap_id: 'MEL-FOUNDER-01' },
  };
  assert.equal(selectActionableAutonomyJob([old, fresh], { epochMs: 4000, roadmap: [] }).id, 'fresh-job');
  assert.equal(selectActionableAutonomyJob([old], { epochMs: 4000, roadmap: [] }), null);
  assert.equal(selectActionableAutonomyJob([old, fresh], { roadmap: [] }).id, 'old-job');
});




test('MAX selector admits only one actionable mission with roadmap before errors and watches', () => {
  const make = (id, source, created_at) => ({ id, requested_by: 'mel-autonomy', status: 'QUEUED', created_at, optional_context: { source } });
  const jobs = [make('watch-1', 'ecosystem-watch', 1), make('error-ledger-1', 'error-ledger', 2), make('roadmap-1', 'autonomy-supervisor', 3)];
  const selected = selectActionableAutonomyJobs(jobs, { roadmap: [], limit: 1 });
  assert.equal(selected.length, 1);
  assert.equal(selected[0].id, 'roadmap-1');
  assert.equal(selectActionableAutonomyJobs(jobs.slice(0, 2), { roadmap: [] })[0].id, 'error-ledger-1');
});


test('MAX does not restart exhausted identical provider retries when cooldown expires', async () => {
  const repository = repo();
  const job = await repository.create({
    id: 'mel-autonomy-manifest-01-retry', requested_by: 'mel-autonomy',
    goal: '[MEL-MANIFEST-01] Retry provider',
    optional_context: { roadmap_id: 'MEL-MANIFEST-01', source: 'autonomy-supervisor' },
  });
  await repository.update(job.id, { result_json: { autonomy_deferral: {
    exhausted: true, phase: 'mentor', attempts: 3, max_attempts: 3,
    retry_after: Date.now() - 60_000,
  } } });
  const supervisor = new AutonomySupervisor({ repository, roadmap: [
    { id: 'MEL-MANIFEST-01', title: 'Retry provider', status: 'PLANNED', priority: 'P0' },
  ] });
  const parked = await supervisor.ensureNextJob();
  assert.equal(parked.job, null);
  assert.equal(parked.external_progress?.status, 'DEFERRED_PROVIDER_RETRY_PENDING');
});

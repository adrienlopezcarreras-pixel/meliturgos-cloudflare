import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { AutonomySupervisor, selectActionableAutonomyJob } from '../src/evolution/autonomy-supervisor.js';

function repo() {
  return new D1DevJobRepository(null, { memoryStore: new Map() });
}

const roadmap = [
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

test('owner priority remains intact when owner and internal jobs are both implementation-ready', async () => {
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

  assert.equal(selected.job.id, owner.id);
  assert.equal(selected.job.requested_by, 'owner-chat');
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

  const approved = await repository.create({
    id: 'approved-implementation',
    requested_by: 'mel-autonomy',
    goal: 'approved implementation',
    optional_context: { roadmap_id: 'GEN2-17', source: 'autonomy-supervisor', priority: 'P0' },
  });
  await repository.update(approved.id, { status: 'TEACHER_APPROVED' });

  const jobs = await repository.list();
  const selected = selectActionableAutonomyJob(jobs);
  assert.equal(selected.id, approved.id);

  const supervisor = new AutonomySupervisor({ repository, roadmap });
  const ensured = await supervisor.ensureNextJob();
  assert.equal(ensured.job.id, approved.id);
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

  const other = await repository.create({
    id: 'approved-newer',
    requested_by: 'mel-autonomy',
    goal: 'other approved work',
    optional_context: { roadmap_id: 'GEN2-17', source: 'autonomy-supervisor', priority: 'P0' },
  });
  await repository.update(other.id, { status: 'TEACHER_APPROVED' });

  const selected = selectActionableAutonomyJob(await repository.list());
  assert.equal(selected.id, repair.id);
  assert.equal(selected.status, 'REPAIR_REQUIRED');
});

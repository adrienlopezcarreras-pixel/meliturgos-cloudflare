import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { AutonomySupervisor } from '../src/evolution/autonomy-supervisor.js';

function repo() {
  return new D1DevJobRepository(null, { memoryStore: new Map() });
}

const roadmap = [
  { id: 'GEN2-17', title: 'Dev Agent', status: 'PARTIAL', priority: 'P0', next: 'controlled self-development', phase_id: 'P06', phase: 'Evolution' },
];

async function createRequeuedInternal(repository, reason = 'TEACHER_APPROVAL_CANDIDATE_SHA_STALE') {
  const internal = await repository.create({
    id: 'mel-autonomy-gen2-17-1',
    requested_by: 'mel-autonomy',
    goal: '[GEN2-17] Dev Agent',
    optional_context: { roadmap_id: 'GEN2-17', source: 'autonomy-supervisor', priority: 'P0' },
  });
  return repository.update(internal.id, {
    status: 'QUEUED',
    plan_json: {
      revision: {
        previous_request_id: 'old-teacher-request',
        reason,
      },
    },
    result_json: {
      last_teacher_review: {
        request_id: 'old-teacher-request',
        verdict: 'APPROVE_PLAN',
      },
    },
  });
}

test('a requeued internal Teacher revision outruns an unrelated owner preflight', async () => {
  const repository = repo();
  const owner = await repository.create({
    id: 'owner-claimed-preflight',
    requested_by: 'owner-chat',
    goal: 'new owner preflight',
    optional_context: { source: 'owner-chat', priority: 'P0' },
  });
  await createRequeuedInternal(repository);

  const supervisor = new AutonomySupervisor({ repository, roadmap });
  const selected = await supervisor.ensureNextJob();
  assert.equal(selected.created, false);
  assert.equal(selected.job.id, 'mel-autonomy-gen2-17-1');
  assert.equal(selected.job.status, 'QUEUED');
  assert.equal((await repository.get(owner.id)).status, owner.status);
});

test('a branch-mismatch revision outruns an already CLAIMED owner preflight matching the live queue state', async () => {
  const repository = repo();
  const owner = await repository.create({
    id: 'owner-live-claimed-preflight',
    requested_by: 'owner-chat',
    goal: 'owner request already claimed for preflight',
    optional_context: { source: 'owner-chat', priority: 'P0' },
  });
  await repository.update(owner.id, { status: 'CLAIMED' });
  await createRequeuedInternal(repository, 'TEACHER_APPROVAL_CANDIDATE_BRANCH_MISMATCH');

  const supervisor = new AutonomySupervisor({ repository, roadmap });
  const selected = await supervisor.ensureNextJob();
  assert.equal(selected.created, false);
  assert.equal(selected.job.id, 'mel-autonomy-gen2-17-1');
  assert.equal(selected.job.status, 'QUEUED');
  assert.equal((await repository.get(owner.id)).status, 'CLAIMED');
});

test('implementation-ready owner work still outruns a requeued internal revision', async () => {
  const repository = repo();
  await createRequeuedInternal(repository);
  const owner = await repository.create({
    id: 'owner-approved',
    requested_by: 'owner-chat',
    goal: 'owner implementation already approved',
    optional_context: { source: 'owner-chat', priority: 'P0' },
  });
  await repository.update(owner.id, { status: 'TEACHER_APPROVED' });

  const supervisor = new AutonomySupervisor({ repository, roadmap });
  const selected = await supervisor.ensureNextJob();
  assert.equal(selected.job.id, owner.id);
  assert.equal(selected.job.requested_by, 'owner-chat');
});

test('fresh internal preflight does not bypass ordinary owner priority', async () => {
  const repository = repo();
  const owner = await repository.create({
    id: 'owner-normal-priority',
    requested_by: 'owner-chat',
    goal: 'ordinary owner preflight',
    optional_context: { source: 'owner-chat', priority: 'P0' },
  });
  const internal = await repository.create({
    id: 'mel-autonomy-gen2-17-1',
    requested_by: 'mel-autonomy',
    goal: '[GEN2-17] Dev Agent',
    optional_context: { roadmap_id: 'GEN2-17', source: 'autonomy-supervisor', priority: 'P0' },
  });
  await repository.update(internal.id, { status: 'QUEUED' });

  const supervisor = new AutonomySupervisor({ repository, roadmap });
  const selected = await supervisor.ensureNextJob();
  assert.equal(selected.job.id, owner.id);
});

test('an in-flight internal Teacher review reserves shared candidate before new roadmap creation', async () => {
  const repository = repo();
  const reviewing = await repository.create({
    id: 'mel-autonomy-gen2-17-review',
    requested_by: 'mel-autonomy',
    goal: '[GEN2-17] Dev Agent',
    optional_context: { roadmap_id: 'GEN2-17', source: 'autonomy-supervisor', priority: 'P0' },
  });
  await repository.update(reviewing.id, {
    status: 'WAITING_TEACHER',
    result_json: { teacher_bridge: { status: 'WAITING_TEACHER' } },
  });
  const supervisor = new AutonomySupervisor({
    repository,
    roadmap: [...roadmap, { id: 'MEL-FOUNDER-02', title: 'Next candidate', status: 'PLANNED', priority: 'P0', phase_id: 'P01' }],
  });
  const selection = await supervisor.ensureNextJob();
  assert.equal(selection.created, false);
  assert.equal(selection.job, null);
  assert.equal(selection.external_progress.job_id, reviewing.id);
  assert.equal(selection.external_progress.status, 'TEACHER_REVIEW_IN_PROGRESS');
  assert.equal((await repository.list()).length, 1);
});

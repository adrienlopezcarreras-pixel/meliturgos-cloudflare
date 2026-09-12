import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { AutonomySupervisor } from '../src/evolution/autonomy-supervisor.js';

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

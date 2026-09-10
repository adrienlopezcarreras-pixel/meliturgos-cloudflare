import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { AutonomySupervisor, selectNextAutonomyItem } from '../src/evolution/autonomy-supervisor.js';

test('autonomy selector prioritizes the unfinished Work engine before lower-value roadmap items', () => {
  const next = selectNextAutonomyItem({
    roadmap: [
      { id: 'MEL-UI-X', title: 'UI polish', status: 'IN_PROGRESS', priority: 'P0' },
      { id: 'GEN2-17', title: 'Dev Agent', status: 'PLANNED', priority: 'P0' },
      { id: 'MEL-WORK-01', title: 'Work Engine', status: 'PARTIAL', priority: 'P0' },
    ],
  });
  assert.equal(next.id, 'MEL-WORK-01');
});

test('autonomy supervisor creates one persistent job and does not duplicate it while active', async () => {
  const repo = new D1DevJobRepository(null);
  const roadmap = [
    { id: 'MEL-WORK-01', title: 'Work Engine', status: 'PARTIAL', priority: 'P0', next: 'wire real jobs', phase_id: 'P07', phase: 'Work' },
    { id: 'GEN2-17', title: 'Dev Agent', status: 'PLANNED', priority: 'P0', next: 'controlled self-development', phase_id: 'P06', phase: 'Evolution' },
  ];
  const supervisor = new AutonomySupervisor({ repository: repo, roadmap });
  const first = await supervisor.ensureNextJob();
  assert.equal(first.created, true);
  assert.equal(first.job.requested_by, 'mel-autonomy');
  assert.equal(first.job.optional_context.roadmap_id, 'MEL-WORK-01');

  const second = await supervisor.ensureNextJob();
  assert.equal(second.created, false);
  assert.equal(second.job.id, first.job.id);
  assert.equal((await repo.list()).length, 1);
});

test('autonomy supervisor advances to the next roadmap item after a completed autonomous job', async () => {
  const repo = new D1DevJobRepository(null);
  const roadmap = [
    { id: 'MEL-WORK-01', title: 'Work Engine', status: 'PARTIAL', priority: 'P0', next: 'wire real jobs', phase_id: 'P07', phase: 'Work' },
    { id: 'GEN2-17', title: 'Dev Agent', status: 'PLANNED', priority: 'P0', next: 'controlled self-development', phase_id: 'P06', phase: 'Evolution' },
  ];
  const supervisor = new AutonomySupervisor({ repository: repo, roadmap });
  const first = await supervisor.ensureNextJob();
  await repo.update(first.job.id, { status: 'COMPLETED' });

  const second = await supervisor.ensureNextJob();
  assert.equal(second.created, true);
  assert.equal(second.job.optional_context.roadmap_id, 'GEN2-17');
  assert.notEqual(second.job.id, first.job.id);
});

test('autonomy supervisor skips roadmap items blocked by a real human dependency', () => {
  const next = selectNextAutonomyItem({
    roadmap: [
      { id: 'MEL-WORK-01', title: 'Blocked Work', status: 'BLOCKED_HUMAN', priority: 'P0' },
      { id: 'GEN2-17', title: 'Dev Agent', status: 'PLANNED', priority: 'P0' },
    ],
  });
  assert.equal(next.id, 'GEN2-17');
});

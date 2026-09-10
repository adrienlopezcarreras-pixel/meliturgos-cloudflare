import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { AutonomySupervisor, selectNextAutonomyItem } from '../src/evolution/autonomy-supervisor.js';

function isolatedRepo() {
  return new D1DevJobRepository(null, { memoryStore: new Map() });
}

const roadmap = [
  { id: 'MEL-WORK-01', title: 'Work Engine', status: 'PARTIAL', priority: 'P0', next: 'wire real jobs', phase_id: 'P07', phase: 'Work' },
  { id: 'GEN2-17', title: 'Dev Agent', status: 'PLANNED', priority: 'P0', next: 'controlled self-development', phase_id: 'P06', phase: 'Evolution' },
];

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

test('autonomy supervisor creates one persistent deterministic job and does not duplicate it while active', async () => {
  const repo = isolatedRepo();
  const supervisor = new AutonomySupervisor({ repository: repo, roadmap });
  const first = await supervisor.ensureNextJob();
  assert.equal(first.created, true);
  assert.equal(first.job.id, 'mel-autonomy-mel-work-01-1');
  assert.equal(first.job.requested_by, 'mel-autonomy');
  assert.equal(first.job.optional_context.roadmap_id, 'MEL-WORK-01');
  assert.equal(first.job.optional_context.attempt, 1);

  const second = await supervisor.ensureNextJob();
  assert.equal(second.created, false);
  assert.equal(second.job.id, first.job.id);
  assert.equal((await repo.list()).length, 1);
});

test('two simultaneous autonomy supervisors converge on the same deterministic job', async () => {
  const repo = isolatedRepo();
  const a = new AutonomySupervisor({ repository: repo, roadmap });
  const b = new AutonomySupervisor({ repository: repo, roadmap });
  const [left, right] = await Promise.all([a.ensureNextJob(), b.ensureNextJob()]);
  assert.equal(left.job.id, 'mel-autonomy-mel-work-01-1');
  assert.equal(right.job.id, left.job.id);
  assert.deepEqual([left.created, right.created].sort(), [false, true]);
  const jobs = (await repo.list()).filter((job) => job.requested_by === 'mel-autonomy');
  assert.equal(jobs.length, 1);
});

test('autonomy supervisor advances to the next roadmap item after a completed autonomous job', async () => {
  const repo = isolatedRepo();
  const supervisor = new AutonomySupervisor({ repository: repo, roadmap });
  const first = await supervisor.ensureNextJob();
  await repo.update(first.job.id, { status: 'COMPLETED' });

  const second = await supervisor.ensureNextJob();
  assert.equal(second.created, true);
  assert.equal(second.job.optional_context.roadmap_id, 'GEN2-17');
  assert.equal(second.job.id, 'mel-autonomy-gen2-17-1');
  assert.notEqual(second.job.id, first.job.id);
});

test('a retryable failed roadmap item receives the next deterministic attempt id', async () => {
  const repo = isolatedRepo();
  const supervisor = new AutonomySupervisor({ repository: repo, roadmap });
  const first = await supervisor.ensureNextJob();
  await repo.update(first.job.id, { status: 'FAILED', error: 'TRANSIENT_TEST_FAILURE' });

  const retry = await supervisor.ensureNextJob();
  assert.equal(retry.created, true);
  assert.equal(retry.job.optional_context.roadmap_id, 'MEL-WORK-01');
  assert.equal(retry.job.optional_context.attempt, 2);
  assert.equal(retry.job.id, 'mel-autonomy-mel-work-01-2');
});

test('an explicitly autonomy-blocked failure is skipped and the supervisor advances safely', async () => {
  const repo = isolatedRepo();
  const supervisor = new AutonomySupervisor({ repository: repo, roadmap });
  const first = await supervisor.ensureNextJob();
  await repo.update(first.job.id, {
    status: 'FAILED',
    result_json: { autonomy_blocked: true, autonomy_block_reason: 'TEACHER_REJECT' },
  });

  const next = await supervisor.ensureNextJob();
  assert.equal(next.job.optional_context.roadmap_id, 'GEN2-17');
  assert.equal(next.job.id, 'mel-autonomy-gen2-17-1');
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

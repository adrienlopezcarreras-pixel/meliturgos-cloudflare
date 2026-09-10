import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { AutonomySupervisor, selectNextAutonomyItem, isSupervisedAutonomyJob } from '../src/evolution/autonomy-supervisor.js';

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

test('explicit owner-chat development is supervised autonomy and outranks background roadmap work', async () => {
  const repo = isolatedRepo();
  const supervisor = new AutonomySupervisor({ repository: repo, roadmap });
  const background = await supervisor.ensureNextJob();
  assert.equal(background.job.requested_by, 'mel-autonomy');

  const owner = await repo.create({
    id: 'owner-chat-priority',
    requested_by: 'owner-chat',
    goal: 'Développe une compétence calendrier',
    optional_context: { source: 'owner-chat', priority: 'P0' },
  });
  assert.equal(isSupervisedAutonomyJob(owner), true);

  const selected = await supervisor.ensureNextJob();
  assert.equal(selected.created, false);
  assert.equal(selected.job.id, owner.id);
  assert.equal(selected.job.requested_by, 'owner-chat');
});

test('owner-chat work prevents creation of a new background roadmap job while it is active', async () => {
  const repo = isolatedRepo();
  await repo.create({
    id: 'owner-only',
    requested_by: 'owner-chat',
    goal: 'Ajouter un module demandé par le propriétaire',
    optional_context: { source: 'owner-chat', priority: 'P0' },
  });
  const supervisor = new AutonomySupervisor({ repository: repo, roadmap });
  const selected = await supervisor.ensureNextJob();
  assert.equal(selected.created, false);
  assert.equal(selected.job.id, 'owner-only');
  assert.equal((await repo.list()).filter((job) => job.requested_by === 'mel-autonomy').length, 0);
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

test('manual unsupervised completion cannot forge roadmap completion or consume an attempt', async () => {
  const repo = isolatedRepo();
  const manual = await repo.create({
    id: 'manual-professor-job',
    requested_by: 'professor-manual',
    goal: 'manual experiment',
    optional_context: { roadmap_id: 'MEL-WORK-01' },
  });
  await repo.update(manual.id, { status: 'COMPLETED' });

  const supervisor = new AutonomySupervisor({ repository: repo, roadmap });
  const state = await supervisor.state();
  assert.deepEqual(state.completedIds, []);
  assert.equal(state.supervisedJobs.length, 0);

  const created = await supervisor.ensureNextJob();
  assert.equal(created.job.id, 'mel-autonomy-mel-work-01-1');
  assert.equal(created.job.optional_context.attempt, 1);
});

test('manual unsupervised active roadmap job cannot block the real autonomy queue', async () => {
  const repo = isolatedRepo();
  await repo.create({
    id: 'manual-active',
    requested_by: 'professor-manual',
    goal: 'manual work engine experiment',
    optional_context: { roadmap_id: 'MEL-WORK-01' },
  });

  const supervisor = new AutonomySupervisor({ repository: repo, roadmap });
  const state = await supervisor.state();
  assert.deepEqual(state.activeIds, []);
  const created = await supervisor.ensureNextJob();
  assert.equal(created.created, true);
  assert.equal(created.job.id, 'mel-autonomy-mel-work-01-1');
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { AutonomySupervisor } from '../src/evolution/autonomy-supervisor.js';

function isolatedRepo() {
  return new D1DevJobRepository(null, { memoryStore: new Map() });
}

const roadmap = [
  { id: 'MEL-WORK-01', title: 'Work Engine', status: 'PARTIAL', priority: 'P0', phase_id: 'P07', phase: 'Work' },
  { id: 'GEN2-17', title: 'Dev Agent', status: 'PLANNED', priority: 'P0', phase_id: 'P06', phase: 'Evolution' },
];

test('normal supervised mode keeps moving while a real internal Teacher request is pending', async () => {
  const repo = isolatedRepo();
  const first = await repo.create({
    id: 'mel-autonomy-mel-work-01-1',
    requested_by: 'mel-autonomy',
    goal: '[MEL-WORK-01] Work Engine',
    optional_context: { roadmap_id: 'MEL-WORK-01', source: 'autonomy-supervisor', priority: 'P0' },
  });
  await repo.update(first.id, {
    status: 'WAITING_TEACHER',
    result_json: {
      teacher_bridge: {
        status: 'WAITING_TEACHER',
        request: { request_id: 'teacher-request-1' },
      },
    },
  });

  const supervisor = new AutonomySupervisor({ repository: repo, roadmap });
  const next = await supervisor.ensureNextJob();

  assert.equal(next.created, true);
  assert.equal(next.job.optional_context.roadmap_id, 'GEN2-17');
  assert.equal((await repo.get(first.id)).status, 'WAITING_TEACHER');
});

test('normal supervised mode keeps moving while an approved candidate awaits CI completion evidence', async () => {
  const repo = isolatedRepo();
  const first = await repo.create({
    id: 'mel-autonomy-mel-work-01-1',
    requested_by: 'mel-autonomy',
    goal: '[MEL-WORK-01] Work Engine',
    optional_context: { roadmap_id: 'MEL-WORK-01', source: 'autonomy-supervisor', priority: 'P0' },
  });
  await repo.update(first.id, {
    status: 'READY_FOR_REVIEW',
    result_json: {
      teacher_bridge: {
        status: 'ANSWERED',
        review: { verdict: 'APPROVE_PLAN', development_allowed: true },
      },
      dev_bridge: {
        status: 'READY_FOR_REVIEW',
        needs_repair: false,
      },
    },
  });

  const supervisor = new AutonomySupervisor({ repository: repo, roadmap });
  const next = await supervisor.ensureNextJob();

  assert.equal(next.created, true);
  assert.equal(next.job.optional_context.roadmap_id, 'GEN2-17');
  assert.equal((await repo.get(first.id)).status, 'READY_FOR_REVIEW');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { isClaimedPreparedDevBridgeJob } from '../src/dev/bridge-job-state.js';
import { AutonomySupervisor } from '../src/evolution/autonomy-supervisor.js';

const ROADMAP_A = {
  id: 'TEST-BRIDGE-A',
  title: 'Bridge execution A',
  phase_id: 'TEST',
  phase: 'Tests',
  priority: 'P0',
  status: 'IN_PROGRESS',
};
const ROADMAP_B = {
  id: 'TEST-BRIDGE-B',
  title: 'Bridge execution B',
  phase_id: 'TEST',
  phase: 'Tests',
  priority: 'P0',
  status: 'IN_PROGRESS',
};

async function createClaimedPreparedJob(repository, roadmapId = ROADMAP_A.id) {
  const requestId = `teacher-${roadmapId}`;
  const created = await repository.create({
    id: `mel-autonomy-${roadmapId.toLowerCase()}-1`,
    requested_by: 'mel-autonomy',
    goal: `[${roadmapId}] prepared Bridge execution`,
    optional_context: {
      roadmap_id: roadmapId,
      phase_id: 'TEST',
      phase: 'Tests',
      priority: 'P0',
      source: 'autonomy-supervisor',
      candidate_branch_only: true,
      zero_added_cost: true,
      attempt: 1,
    },
  });

  await repository.update(created.id, {
    status: 'TEACHER_APPROVED',
    candidate_branch: 'candidate/mel-clean-autonomy',
    files_json: [{ path: 'src/example.js', content: 'export const value = 1;\n' }],
    tests_json: [{ command: 'node --test tests/example.test.mjs' }],
    result_json: {
      teacher_bridge: {
        status: 'ANSWERED',
        request: { request_id: requestId },
        review: {
          request_id: requestId,
          verdict: 'APPROVE_PLAN',
          development_allowed: true,
        },
      },
      bridge_preparation: {
        status: 'READY',
        teacher_request_id: requestId,
        candidate_branch: 'candidate/mel-clean-autonomy',
        candidate_sha: 'a'.repeat(40),
      },
    },
  });

  const claimed = await repository.claim();
  assert.equal(claimed?.id, created.id);
  assert.equal(claimed?.status, 'CLAIMED');
  return claimed;
}

test('a claimed correlated Teacher-approved Bridge package remains recognizable after claim', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const claimed = await createClaimedPreparedJob(repository);

  assert.equal(isClaimedPreparedDevBridgeJob(claimed), true);

  const broken = {
    ...claimed,
    result_json: {
      ...claimed.result_json,
      bridge_preparation: {
        ...claimed.result_json.bridge_preparation,
        teacher_request_id: 'different-request',
      },
    },
  };
  assert.equal(isClaimedPreparedDevBridgeJob(broken), false);
});

test('claimed Bridge execution is passive and does not block creation of the next roadmap job', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const claimed = await createClaimedPreparedJob(repository, ROADMAP_A.id);
  const supervisor = new AutonomySupervisor({ repository, roadmap: [ROADMAP_A, ROADMAP_B] });

  const ensured = await supervisor.ensureNextJob();

  assert.equal(ensured.created, true);
  assert.equal(ensured.job?.optional_context?.roadmap_id, ROADMAP_B.id);
  assert.equal(ensured.job?.status, 'QUEUED');

  const stillClaimed = await repository.get(claimed.id);
  assert.equal(stillClaimed?.status, 'CLAIMED');
  assert.equal(stillClaimed?.result_json?.teacher_bridge?.status, 'ANSWERED');
  assert.equal(isClaimedPreparedDevBridgeJob(stillClaimed), true);
});

test('when roadmap work is exhausted, claimed Bridge execution is never returned to the runtime preflight path', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const claimed = await createClaimedPreparedJob(repository, ROADMAP_A.id);
  const supervisor = new AutonomySupervisor({ repository, roadmap: [ROADMAP_A] });

  const ensured = await supervisor.ensureNextJob();

  assert.equal(ensured.created, false);
  assert.equal(ensured.job, null);
  assert.equal(ensured.complete, false);
  assert.equal(ensured.external_progress?.job_id, claimed.id);
  assert.equal(ensured.external_progress?.status, 'BRIDGE_EXECUTION_IN_PROGRESS');

  const untouched = await repository.get(claimed.id);
  assert.equal(untouched?.status, 'CLAIMED');
  assert.equal(isClaimedPreparedDevBridgeJob(untouched), true);
});

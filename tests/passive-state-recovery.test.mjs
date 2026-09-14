import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { recoverPassiveRuntimeStates } from '../src/evolution/passive-state-recovery.js';

const OLD_SHA = '1111111111111111111111111111111111111111';
const NEW_SHA = '2222222222222222222222222222222222222222';

test('stale WAITING_TEACHER is requeued against the deployed candidate SHA', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await repository.create({ id: 'owner-chat-stale', requested_by: 'owner-chat', goal: 'stale teacher' });
  await repository.update(job.id, {
    status: 'WAITING_TEACHER',
    result_json: {
      teacher_bridge: {
        status: 'WAITING_TEACHER',
        request: { request_id: 'req-old', target_sha: OLD_SHA, candidate: { branch: 'candidate/mel-clean-autonomy', sha: OLD_SHA } },
      },
    },
  });
  const result = await recoverPassiveRuntimeStates(repository, { canonicalSha: NEW_SHA });
  assert.equal(result.recovered.length, 1);
  const stored = await repository.get(job.id);
  assert.equal(stored.status, 'QUEUED');
  assert.equal(stored.result_json.teacher_bridge, null);
  assert.equal(stored.plan_json.revision.current_candidate_sha, NEW_SHA);
});

test('orphan READY_FOR_REVIEW without Teacher chain is requeued instead of remaining passive forever', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await repository.create({ id: 'owner-goal-orphan', requested_by: 'owner-chat', goal: 'orphan review' });
  await repository.update(job.id, { status: 'READY_FOR_REVIEW', result_json: {} });
  const result = await recoverPassiveRuntimeStates(repository, { canonicalSha: NEW_SHA });
  assert.equal(result.recovered.length, 1);
  const stored = await repository.get(job.id);
  assert.equal(stored.status, 'QUEUED');
  assert.equal(stored.result_json.passive_state_recovery.reason, 'TEACHER_APPROVAL_MISSING');
});

test('valid READY_FOR_REVIEW with approved Teacher and dev package stays untouched', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await repository.create({ id: 'owner-goal-valid', requested_by: 'owner-chat', goal: 'valid review' });
  await repository.update(job.id, {
    status: 'READY_FOR_REVIEW',
    result_json: {
      teacher_bridge: { status: 'ANSWERED', review: { verdict: 'APPROVE_PLAN', development_allowed: true } },
      dev_bridge: { status: 'READY_FOR_REVIEW', needs_repair: false },
    },
  });
  const result = await recoverPassiveRuntimeStates(repository, { canonicalSha: NEW_SHA });
  assert.equal(result.recovered.length, 0);
  assert.equal((await repository.get(job.id)).status, 'READY_FOR_REVIEW');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository, isPreparedDevBridgeJob } from '../src/dev/d1-dev-job-repository.js';

async function buildApproved(repository, { prepared = true, correlated = true } = {}) {
  const job = await repository.create({ id: `approved-${crypto.randomUUID()}`, requested_by: 'mel-autonomy', goal: 'x' });
  const requestId = 'req-1';
  return repository.update(job.id, {
    status: 'TEACHER_APPROVED',
    files_json: prepared ? [{ path: 'src/example.js', content: 'export const ready=true;\n' }] : [],
    tests_json: prepared ? [{ name: 'test:smoke', command: 'test:smoke', passed: false }] : [],
    result_json: {
      teacher_bridge: {
        status: 'ANSWERED',
        request: { request_id: requestId },
        review: { request_id: correlated ? requestId : 'wrong', verdict: 'APPROVE_PLAN', development_allowed: true },
      },
      bridge_preparation: prepared ? {
        status: 'READY',
        teacher_request_id: requestId,
        candidate_branch: 'candidate/mel-clean-autonomy',
      } : null,
    },
  });
}

test('only correlated approved structured work is recognized as bridge-prepared', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const good = await buildApproved(repository);
  const missing = await buildApproved(repository, { prepared: false });
  const badCorrelation = await buildApproved(repository, { correlated: false });
  assert.equal(isPreparedDevBridgeJob(good), true);
  assert.equal(isPreparedDevBridgeJob(missing), false);
  assert.equal(isPreparedDevBridgeJob(badCorrelation), false);
});

test('claim prioritizes prepared Teacher-approved work over a legacy queued job', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const queued = await repository.create({ id: 'legacy-queued', goal: 'legacy' });
  const approved = await buildApproved(repository);
  const claimed = await repository.claim();
  assert.equal(claimed.id, approved.id);
  assert.equal(claimed.status, 'CLAIMED');
  assert.equal((await repository.get(queued.id)).status, 'QUEUED');
});

test('Teacher approval without structured bridge preparation cannot bypass the gate', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const approvedButNotPrepared = await buildApproved(repository, { prepared: false });
  assert.equal(isPreparedDevBridgeJob(approvedButNotPrepared), false);
  const claimed = await repository.claim();
  assert.equal(claimed, null);
  assert.equal((await repository.get(approvedButNotPrepared.id)).status, 'TEACHER_APPROVED');
});

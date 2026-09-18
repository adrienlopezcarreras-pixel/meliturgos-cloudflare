import test from 'node:test';
import assert from 'node:assert/strict';
import {
  D1DevJobRepository,
  isLegacyQueuedDevBridgeJob,
  isTeacherGatedDevJob,
} from '../src/dev/d1-dev-job-repository.js';

async function prepareApprovedBridgeJob(repository, { id = 'mel-approved-1', requestedBy = 'mel-autonomy' } = {}) {
  const requestId = `teacher-${id}`;
  const created = await repository.create({
    id,
    requested_by: requestedBy,
    goal: 'Teacher-approved candidate implementation',
  });
  return repository.update(created.id, {
    status: 'TEACHER_APPROVED',
    candidate_branch: 'candidate/mel-clean-autonomy',
    files_json: [{ path: 'src/example.js', content: 'export const approved = true;\n' }],
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
}

test('supervised QUEUED jobs are Teacher-gated and not directly claimable by the Dev Bridge', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const mel = await repository.create({ id: 'mel-queued', requested_by: 'mel-autonomy', goal: 'MEL queued work' });
  const owner = await repository.create({ id: 'owner-queued', requested_by: 'owner-chat:ui', goal: 'Owner queued work' });

  assert.equal(isTeacherGatedDevJob(mel), true);
  assert.equal(isTeacherGatedDevJob(owner), true);
  assert.equal(isLegacyQueuedDevBridgeJob(mel), false);
  assert.equal(isLegacyQueuedDevBridgeJob(owner), false);

  const claimed = await repository.claim();
  assert.equal(claimed, null);
  assert.equal((await repository.get(mel.id))?.status, 'QUEUED');
  assert.equal((await repository.get(owner.id))?.status, 'QUEUED');
});

test('legacy/manual QUEUED jobs remain directly claimable while supervised queued jobs are skipped', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  await repository.create({ id: 'mel-queued', requested_by: 'mel-autonomy', goal: 'MEL queued work' });
  await repository.create({ id: 'owner-queued', requested_by: 'owner-chat', goal: 'Owner queued work' });
  const manual = await repository.create({ id: 'professor-queued', requested_by: 'professor', goal: 'Legacy manual work' });

  assert.equal(isLegacyQueuedDevBridgeJob(manual), true);
  const claimed = await repository.claim();
  assert.equal(claimed?.id, manual.id);
  assert.equal(claimed?.status, 'CLAIMED');
  assert.equal((await repository.get('mel-queued'))?.status, 'QUEUED');
  assert.equal((await repository.get('owner-queued'))?.status, 'QUEUED');
});

test('prepared Teacher-approved supervised work still outranks legacy queued work', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const manual = await repository.create({ id: 'professor-queued', requested_by: 'professor', goal: 'Legacy manual work' });
  const approved = await prepareApprovedBridgeJob(repository, { id: 'mel-approved', requestedBy: 'mel-autonomy' });

  const claimed = await repository.claim();
  assert.equal(claimed?.id, approved.id);
  assert.equal(claimed?.status, 'CLAIMED');
  assert.equal((await repository.get(manual.id))?.status, 'QUEUED');
});

test('owner-chat becomes claimable only after the same correlated Teacher approval package', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const approved = await prepareApprovedBridgeJob(repository, { id: 'owner-approved', requestedBy: 'owner-chat:web' });

  const claimed = await repository.claim();
  assert.equal(claimed?.id, approved.id);
  assert.equal(claimed?.status, 'CLAIMED');
});

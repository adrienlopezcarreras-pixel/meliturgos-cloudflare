import test from 'node:test';
import assert from 'node:assert/strict';
import { createDevJobCheckpoint, verifyDevJobCheckpoint } from '../src/dev/dev-job-checkpoint.js';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';

test('development job checkpoint round-trips with candidate SHA and audit evidence', async () => {
  const repo = new D1DevJobRepository(null);
  const job = await repo.create({ id: 'resume-1', goal: 'Harden resumability' });
  await repo.update(job.id, {
    status: 'TEST',
    candidate_branch: 'candidate/augmentio-core',
    tests_json: [{ name: 'targeted', passed: true }],
  });
  const checkpoint = await repo.checkpoint(job.id, {
    candidate_sha: 'abc123',
    blockers: ['full CI pending'],
    audit: [{ event: 'targeted_tests_passed' }],
  });
  assert.equal(checkpoint.stage, 'TEST');
  assert.equal(checkpoint.candidate_branch, 'candidate/augmentio-core');
  assert.equal(checkpoint.candidate_sha, 'abc123');
  assert.ok(checkpoint.integrity_sha256);
  const resumed = await repo.resume(job.id);
  assert.equal(resumed.checkpoint.job_id, job.id);
  assert.deepEqual(resumed.checkpoint.audit, [{ event: 'targeted_tests_passed' }]);
});

test('checkpoint restore detects tampering', async () => {
  const cp = await createDevJobCheckpoint({ id: 'tamper-1', status: 'PLAN' }, { audit: [{ event: 'planned' }] });
  cp.audit[0].event = 'release_approved';
  await assert.rejects(() => verifyDevJobCheckpoint(cp), err => err?.code === 'CHECKPOINT_INTEGRITY_MISMATCH');
});

test('advanced resume state fails closed without candidate evidence', async () => {
  await assert.rejects(
    () => createDevJobCheckpoint({ id: 'bad-stage', status: 'TEST' }, { candidate_sha: 'abc123' }),
    err => err?.code === 'CHECKPOINT_CANDIDATE_REQUIRED'
  );
  await assert.rejects(
    () => createDevJobCheckpoint({ id: 'bad-sha', status: 'TEST', candidate_branch: 'candidate/augmentio-core' }),
    err => err?.code === 'CHECKPOINT_SHA_REQUIRED'
  );
  await assert.rejects(
    () => createDevJobCheckpoint({ id: 'bad-branch', status: 'EDIT', candidate_branch: 'main' }),
    err => err?.code === 'CHECKPOINT_NON_CANDIDATE_BRANCH'
  );
});

test('release checkpoint requires passing test evidence', async () => {
  await assert.rejects(
    () => createDevJobCheckpoint(
      { id: 'release-1', status: 'RELEASE_CANDIDATE', candidate_branch: 'candidate/augmentio-core' },
      { candidate_sha: 'abc123', tests: [{ name: 'full-ci', passed: false }] }
    ),
    err => err?.code === 'CHECKPOINT_TEST_EVIDENCE_REQUIRED'
  );
});

test('checkpoint strips secret-shaped fields and redacts secret-shaped values', async () => {
  const cp = await createDevJobCheckpoint(
    { id: 'secret-1', status: 'PLAN' },
    {
      blockers: ['Bearer abcdefghijklmnopqrstuvwxyz'],
      audit: [{ event: 'review', api_key: 'must-not-survive', note: 'safe' }],
      council_evidence: { authorization: 'must-not-survive', providers: ['workers-ai'] },
    }
  );
  const serialized = JSON.stringify(cp);
  assert.equal(serialized.includes('must-not-survive'), false);
  assert.equal(serialized.includes('abcdefghijklmnopqrstuvwxyz'), false);
  assert.equal(cp.blockers[0], '[REDACTED]');
  assert.equal(cp.audit[0].note, 'safe');
});

test('repository resume rejects a checkpoint copied onto another job', async () => {
  const repo = new D1DevJobRepository(null);
  const a = await repo.create({ id: 'job-a', goal: 'A' });
  const b = await repo.create({ id: 'job-b', goal: 'B' });
  const cp = await repo.checkpoint(a.id, { stage: 'PLAN' });
  await repo.update(b.id, { result_json: { dev_checkpoint: cp } });
  await assert.rejects(() => repo.resume(b.id), err => err?.code === 'CHECKPOINT_JOB_MISMATCH');
});

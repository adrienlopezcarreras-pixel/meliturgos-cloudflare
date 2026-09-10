import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { createTeacherReviewRequest } from '../src/teachers/teacher-request.js';
import {
  queueRuntimeTeacherRequest,
  listPendingRuntimeTeacherRequests,
  applyRuntimeTeacherReply,
  teacherBridgePublicView,
} from '../src/teachers/runtime-teacher-bridge.js';

function requestFor(jobId) {
  return createTeacherReviewRequest({
    goal: `Review runtime job ${jobId}`,
    council: { responses: [
      { provider: 'workers-ai', model: 'a', zero_added_cost: true, summary: 'A' },
      { provider: 'workers-ai', model: 'b', zero_added_cost: true, summary: 'B' },
    ] },
    inspection: { status: 'COMPLETE', evidence: [{ path: 'src/dev/runtime-api.js' }] },
    spec: { mode: 'candidate-only' },
    candidate: { branch: 'candidate/augmentio-core', sha: 'abc1234' },
    tests: [{ name: 'targeted', passed: true }],
    provenance: { job_id: jobId },
  });
}

test('runtime Teacher outbox queues a sanitized request and exposes only a bounded public view', async () => {
  const repo = new D1DevJobRepository(null);
  const job = await repo.create({ id: `teacher-outbox-${crypto.randomUUID()}`, goal: 'Runtime Teacher proof' });
  const request = requestFor(job.id);
  request.provenance.token = 'must-not-survive';
  const queued = await queueRuntimeTeacherRequest(repo, job.id, request, { authorization: 'must-not-survive', note: 'safe' });
  assert.equal(queued.status, 'WAITING_TEACHER');
  assert.equal(JSON.stringify(queued).includes('must-not-survive'), false);

  const pending = await listPendingRuntimeTeacherRequests(repo);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].request_id, request.request_id);
  const publicView = teacherBridgePublicView(pending);
  assert.equal(publicView[0].objective.includes('Runtime Teacher proof'), false);
  assert.equal(publicView[0].objective.includes(job.id), true);
  assert.equal(JSON.stringify(publicView).includes('inspection'), false);
  assert.equal(JSON.stringify(publicView).includes('council'), false);
});

test('matching runtime Teacher reply advances only to candidate development approval, never production deployment', async () => {
  const repo = new D1DevJobRepository(null);
  const job = await repo.create({ id: `teacher-approve-${crypto.randomUUID()}`, goal: 'Runtime approval proof' });
  const request = requestFor(job.id);
  await queueRuntimeTeacherRequest(repo, job.id, request);
  const applied = await applyRuntimeTeacherReply(repo, {
    request_id: request.request_id,
    verdict: 'APPROVE_PLAN',
    feedback: 'Candidate development may continue.',
  });
  assert.equal(applied.job.status, 'TEACHER_APPROVED');
  assert.equal(applied.state.review.development_allowed, true);
  assert.notEqual(applied.job.status, 'APPROVED');
  assert.notEqual(applied.job.status, 'COMMITTED');

  const duplicate = await applyRuntimeTeacherReply(repo, {
    request_id: request.request_id,
    verdict: 'APPROVE_PLAN',
  });
  assert.equal(duplicate.duplicate, true);
});

test('negative Teacher review blocks the runtime job fail-closed', async () => {
  const repo = new D1DevJobRepository(null);
  const job = await repo.create({ id: `teacher-block-${crypto.randomUUID()}`, goal: 'Block unsafe plan' });
  const request = requestFor(job.id);
  await queueRuntimeTeacherRequest(repo, job.id, request);
  const applied = await applyRuntimeTeacherReply(repo, {
    request_id: request.request_id,
    verdict: 'NEEDS_CHANGES',
    feedback: 'More evidence required.',
  });
  assert.equal(applied.job.status, 'BLOCKED');
  assert.equal(applied.state.review.development_allowed, false);
});

test('unmatched Teacher reply is rejected and cannot unlock another job', async () => {
  const repo = new D1DevJobRepository(null);
  const job = await repo.create({ id: `teacher-mismatch-${crypto.randomUUID()}`, goal: 'Mismatch proof' });
  await queueRuntimeTeacherRequest(repo, job.id, requestFor(job.id));
  await assert.rejects(
    () => applyRuntimeTeacherReply(repo, { request_id: 'wrong', verdict: 'APPROVE_PLAN' }),
    (error) => error?.code === 'TEACHER_REQUEST_NOT_FOUND',
  );
  assert.equal((await repo.get(job.id)).status, 'WAITING_TEACHER');
});

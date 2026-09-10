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

test('NEEDS_CHANGES requeues the same runtime job for a fresh Council instead of idling blocked', async () => {
  const repo = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await repo.create({ id: `teacher-revise-${crypto.randomUUID()}`, goal: 'Revise incomplete plan', plan_json: { preflight: { stale: true } } });
  const request = requestFor(job.id);
  await queueRuntimeTeacherRequest(repo, job.id, request);
  const applied = await applyRuntimeTeacherReply(repo, {
    request_id: request.request_id,
    verdict: 'NEEDS_CHANGES',
    feedback: 'Inspect the completion reconciler before asking again.',
  });
  assert.equal(applied.job.status, 'QUEUED');
  assert.equal(applied.revision_required, true);
  assert.equal(applied.terminal, false);
  assert.equal(applied.job.result_json.teacher_bridge, null);
  assert.equal(applied.job.result_json.last_teacher_review.request_id, request.request_id);
  assert.equal(applied.job.result_json.last_teacher_review.verdict, 'NEEDS_CHANGES');
  assert.equal(applied.job.result_json.teacher_bridge_history.length, 1);
  assert.equal(applied.job.plan_json.preflight, null);
  assert.equal(applied.state.review.development_allowed, false);
});

test('REJECT marks the unsafe runtime job terminal and autonomy-blocked', async () => {
  const repo = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await repo.create({ id: `teacher-reject-${crypto.randomUUID()}`, goal: 'Unsafe plan' });
  const request = requestFor(job.id);
  await queueRuntimeTeacherRequest(repo, job.id, request);
  const applied = await applyRuntimeTeacherReply(repo, {
    request_id: request.request_id,
    verdict: 'REJECT',
    feedback: 'Do not implement this plan.',
  });
  assert.equal(applied.job.status, 'FAILED');
  assert.equal(applied.terminal, true);
  assert.equal(applied.job.result_json.autonomy_blocked, true);
  assert.equal(applied.job.result_json.autonomy_block_reason, 'TEACHER_REJECT');
  assert.equal(applied.job.error, 'TEACHER_REJECT');
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

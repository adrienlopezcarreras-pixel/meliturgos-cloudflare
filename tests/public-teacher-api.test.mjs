import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { createTeacherReviewRequest } from '../src/teachers/teacher-request.js';
import { queueRuntimeTeacherRequest } from '../src/teachers/runtime-teacher-bridge.js';
import { maybeHandlePublicTeacherBridge, summarizeAutonomyJobs } from '../src/teachers/public-teacher-api.js';

test('public Teacher feed is read-only and omits full council/inspection/private evidence', async () => {
  const repo = new D1DevJobRepository(null);
  const job = await repo.create({ id: `public-teacher-${crypto.randomUUID()}`, goal: 'Public minimal Teacher request' });
  const request = createTeacherReviewRequest({
    goal: 'Technical review only',
    council: { responses: [
      { provider: 'workers-ai', model: 'a', zero_added_cost: true, summary: 'PRIVATE COUNCIL DETAIL' },
      { provider: 'workers-ai', model: 'b', zero_added_cost: true, summary: 'PRIVATE COUNCIL DETAIL 2' },
    ] },
    inspection: { status: 'COMPLETE', evidence: [{ path: 'src/x.js', finding: 'PRIVATE INSPECTION DETAIL' }] },
    spec: { hidden_detail: 'PRIVATE SPEC DETAIL' },
    candidate: { branch: 'candidate/augmentio-core', sha: 'abc1234' },
    patchSummary: 'bounded public patch summary',
    tests: [{ name: 'test', passed: true }],
    unknowns: ['one technical unknown'],
  });
  await queueRuntimeTeacherRequest(repo, job.id, request);

  const response = await maybeHandlePublicTeacherBridge(new Request('http://x/api/teacher/pending'), {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control').includes('no-store'), true);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.mutation_allowed, false);
  const row = body.pending.find((item) => item.request_id === request.request_id);
  assert.ok(row);
  const serialized = JSON.stringify(row);
  assert.equal(serialized.includes('PRIVATE COUNCIL DETAIL'), false);
  assert.equal(serialized.includes('PRIVATE INSPECTION DETAIL'), false);
  assert.equal(serialized.includes('PRIVATE SPEC DETAIL'), false);
  assert.equal(serialized.includes('bounded public patch summary'), true);
});

test('autonomy status exposes opaque Teacher correlation but never goals or private review evidence', () => {
  const summary = summarizeAutonomyJobs([
    {
      id: 'job-1',
      requested_by: 'mel-autonomy',
      status: 'WAITING_TEACHER',
      goal: 'PRIVATE GOAL MUST NOT LEAK',
      created_at: 1,
      optional_context: { roadmap_id: 'MEL-WORK-01' },
      result_json: {
        teacher_bridge: {
          status: 'WAITING_TEACHER',
          request: { request_id: 'opaque-request-1', objective: 'PRIVATE OBJECTIVE' },
          evidence: { inspection: 'PRIVATE EVIDENCE' },
        },
      },
    },
    {
      id: 'job-2',
      requested_by: 'mel-autonomy',
      status: 'COMPLETED',
      goal: 'ANOTHER PRIVATE GOAL',
      created_at: 2,
      optional_context: { roadmap_id: 'MEL-WORK-00' },
    },
    { id: 'manual', requested_by: 'professor', status: 'WAITING_TEACHER', goal: 'MANUAL PRIVATE GOAL' },
  ]);
  assert.equal(summary.total, 2);
  assert.equal(summary.active_count, 1);
  assert.equal(summary.owner_requested_count, 0);
  assert.equal(summary.waiting_teacher_count, 1);
  assert.equal(summary.completed_count, 1);
  assert.deepEqual(summary.current, {
    job_id: 'job-1',
    requested_by: 'mel-autonomy',
    status: 'WAITING_TEACHER',
    roadmap_id: 'MEL-WORK-01',
    teacher_status: 'WAITING_TEACHER',
    request_id: 'opaque-request-1',
    verdict: null,
  });
  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes('PRIVATE GOAL'), false);
  assert.equal(serialized.includes('PRIVATE OBJECTIVE'), false);
  assert.equal(serialized.includes('PRIVATE EVIDENCE'), false);
});

test('explicit owner-chat work is included and becomes the public current technical lifecycle item', () => {
  const summary = summarizeAutonomyJobs([
    {
      id: 'background', requested_by: 'mel-autonomy', status: 'WAITING_TEACHER', created_at: 1,
      optional_context: { roadmap_id: 'MEL-WORK-01' },
      result_json: { teacher_bridge: { status: 'WAITING_TEACHER', request: { request_id: 'background-r' } } },
    },
    {
      id: 'owner-job', requested_by: 'owner-chat', status: 'WAITING_TEACHER', created_at: 2,
      goal: 'PRIVATE OWNER GOAL', optional_context: { priority: 'P0' },
      result_json: { teacher_bridge: { status: 'WAITING_TEACHER', request: { request_id: 'owner-r', objective: 'PRIVATE OWNER OBJECTIVE' } } },
    },
  ]);
  assert.equal(summary.total, 2);
  assert.equal(summary.owner_requested_count, 1);
  assert.equal(summary.current.job_id, 'owner-job');
  assert.equal(summary.current.requested_by, 'owner-chat');
  assert.equal(summary.current.request_id, 'owner-r');
  assert.equal(JSON.stringify(summary).includes('PRIVATE OWNER'), false);
});

test('autonomy status preserves the approved request id so a later Teacher run can correlate CI work', () => {
  const summary = summarizeAutonomyJobs([{
    id: 'approved-job',
    requested_by: 'mel-autonomy',
    status: 'TEACHER_APPROVED',
    created_at: 1,
    optional_context: { roadmap_id: 'GEN2-17' },
    result_json: {
      teacher_bridge: {
        status: 'ANSWERED',
        request: { request_id: 'opaque-approved-request' },
        review: { request_id: 'opaque-approved-request', verdict: 'APPROVE_PLAN', feedback: 'PRIVATE FEEDBACK' },
      },
    },
  }]);
  assert.equal(summary.current.request_id, 'opaque-approved-request');
  assert.equal(summary.current.teacher_status, 'ANSWERED');
  assert.equal(summary.current.verdict, 'APPROVE_PLAN');
  assert.equal(JSON.stringify(summary).includes('PRIVATE FEEDBACK'), false);
});

test('public Teacher status discloses channel/count and minimized autonomy metadata only', async () => {
  const response = await maybeHandlePublicTeacherBridge(new Request('http://x/api/teacher/status'), {});
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.exposes_secrets, false);
  assert.equal(body.exposes_goals, false);
  assert.equal(body.mutation_allowed, false);
  assert.equal(typeof body.pending_count, 'number');
  assert.equal(typeof body.autonomy.active_count, 'number');
  assert.equal('goal' in (body.autonomy.current || {}), false);
});

test('public Teacher API refuses mutation by not handling non-GET requests', async () => {
  const response = await maybeHandlePublicTeacherBridge(new Request('http://x/api/teacher/pending', { method: 'POST', body: '{}' }), {});
  assert.equal(response, null);
});

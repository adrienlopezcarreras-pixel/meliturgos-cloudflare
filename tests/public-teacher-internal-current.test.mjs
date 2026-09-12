import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAutonomyJobs } from '../src/teachers/public-teacher-api.js';

test('public Teacher summary exposes actionable internal autonomy separately from passive owner waits', () => {
  const summary = summarizeAutonomyJobs([
    {
      id: 'owner-wait',
      requested_by: 'owner-chat',
      status: 'WAITING_TEACHER',
      created_at: 1,
      goal: 'PRIVATE OWNER GOAL MUST NOT LEAK',
      result_json: {
        teacher_bridge: {
          status: 'WAITING_TEACHER',
          request: { request_id: 'owner-request', objective: 'PRIVATE OWNER OBJECTIVE MUST NOT LEAK' },
        },
      },
    },
    {
      id: 'mel-autonomy-gen2-17-1',
      requested_by: 'mel-autonomy',
      status: 'TEACHER_APPROVED',
      created_at: 2,
      goal: 'PRIVATE INTERNAL GOAL MUST NOT LEAK',
      optional_context: { roadmap_id: 'GEN2-17', priority: 'P0' },
      result_json: {
        teacher_bridge: {
          status: 'ANSWERED',
          request: { request_id: 'internal-request' },
          review: { request_id: 'internal-request', verdict: 'APPROVE_PLAN', feedback: 'PRIVATE FEEDBACK MUST NOT LEAK' },
        },
        implementation_planning_diagnostic: { status: 'NOT_READY', code: 'ALL_PROVIDERS_FAILED' },
      },
    },
    {
      id: 'mel-passive',
      requested_by: 'mel-autonomy',
      status: 'WAITING_TEACHER',
      created_at: 0,
      optional_context: { roadmap_id: 'MEL-EVOL-01' },
      result_json: { teacher_bridge: { status: 'WAITING_TEACHER', request: { request_id: 'mel-passive-request' } } },
    },
  ]);

  assert.equal(summary.current.job_id, 'owner-wait');
  assert.equal(summary.internal_current.job_id, 'mel-autonomy-gen2-17-1');
  assert.equal(summary.internal_current.requested_by, 'mel-autonomy');
  assert.equal(summary.internal_current.roadmap_id, 'GEN2-17');
  assert.equal(summary.internal_current.teacher_status, 'ANSWERED');
  assert.equal(summary.internal_current.request_id, 'internal-request');
  assert.equal(summary.internal_current.verdict, 'APPROVE_PLAN');
  assert.equal(summary.internal_current.implementation_diagnostic_code, 'ALL_PROVIDERS_FAILED');
  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes('PRIVATE OWNER GOAL'), false);
  assert.equal(serialized.includes('PRIVATE OWNER OBJECTIVE'), false);
  assert.equal(serialized.includes('PRIVATE INTERNAL GOAL'), false);
  assert.equal(serialized.includes('PRIVATE FEEDBACK'), false);
});

test('internal_current is null when no internally generated roadmap job is active', () => {
  const summary = summarizeAutonomyJobs([
    { id: 'owner-only', requested_by: 'owner-chat', status: 'WAITING_TEACHER', created_at: 1 },
  ]);
  assert.equal(summary.internal_current, null);
});

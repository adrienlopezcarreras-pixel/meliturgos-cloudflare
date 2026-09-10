import test from 'node:test';
import assert from 'node:assert/strict';
import { safeInternalWorkPackage, redactPlanText } from '../src/teachers/public-teacher-api.js';

function approvedJob(overrides = {}) {
  return {
    id: 'internal-job-1',
    requested_by: 'mel-autonomy',
    status: 'TEACHER_APPROVED',
    created_at: 1,
    optional_context: { roadmap_id: 'GEN2-17', priority: 'P0' },
    result_json: {
      teacher_bridge: {
        status: 'ANSWERED',
        request: { request_id: 'req-1' },
        review: { request_id: 'req-1', verdict: 'APPROVE_PLAN', development_allowed: true },
      },
      implementation_proposal: {
        status: 'READY',
        teacher_request_id: 'req-1',
        candidate_branch: 'candidate/augmentio-core',
        created_at: '2026-09-10T05:00:00Z',
        inspected_files: [{ path: 'src/example.js', sha: 'abc123' }],
        providers_attempted: ['workers-ai:a', 'workers-ai:b'],
        selected: { model: 'workers-ai:a', text: 'Apply the smallest bounded candidate diff.' },
      },
    },
    ...overrides,
  };
}

test('public work package never exposes owner-chat jobs even when they look approved', () => {
  const job = approvedJob({ requested_by: 'owner-chat' });
  assert.equal(safeInternalWorkPackage([job]), null);
});

test('public work package requires exact Teacher request correlation', () => {
  const job = approvedJob();
  job.result_json.implementation_proposal.teacher_request_id = 'different-request';
  assert.equal(safeInternalWorkPackage([job]), null);
});

test('public work package refuses any non-candidate implementation branch', () => {
  const job = approvedJob();
  job.result_json.implementation_proposal.candidate_branch = 'mel-current';
  assert.equal(safeInternalWorkPackage([job]), null);
});

test('valid internal roadmap work is bounded, secret-redacted and can never authorize production deploy', () => {
  const job = approvedJob();
  job.result_json.implementation_proposal.selected.text = 'Use token=supersecretvalue only as an example; never deploy production.';
  const work = safeInternalWorkPackage([job]);
  assert.ok(work);
  assert.equal(work.kind, 'MEL_INTERNAL_WORK_PACKAGE');
  assert.equal(work.job_id, 'internal-job-1');
  assert.equal(work.request_id, 'req-1');
  assert.equal(work.roadmap_id, 'GEN2-17');
  assert.equal(work.candidate_branch, 'candidate/augmentio-core');
  assert.equal(work.production_deploy_allowed, false);
  assert.equal(work.providers_attempted, 2);
  assert.equal(work.inspected_files.length, 1);
  assert.equal(work.plan.includes('supersecretvalue'), false);
  assert.equal(work.plan.includes('[REDACTED]'), true);
});

test('plan redactor bounds output even when the model returns an oversized proposal', () => {
  const text = `prefix ${'x'.repeat(20000)} password=anothersecretvalue`;
  const redacted = redactPlanText(text);
  assert.ok(redacted.length <= 12000);
});

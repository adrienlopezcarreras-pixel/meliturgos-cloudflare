import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTeacherReviewRequest, applyTeacherReview } from '../src/teachers/teacher-request.js';
import { createDevelopmentJob, advanceDevelopmentJob, DEVELOPMENT_STATES } from '../src/evolution/development-coordinator.js';

const councilResponses = [
  { provider: 'mock-zero-a', model: 'a1', zero_added_cost: true, summary: 'Reuse existing coordinator and fail closed.' },
  { provider: 'mock-zero-b', model: 'b1', zero_added_cost: true, summary: 'Require code inspection and complete validation evidence.' },
];

test('teacher review request requires council and complete code inspection', () => {
  assert.throws(() => createTeacherReviewRequest({ goal: 'x' }), /TEACHER_COUNCIL_REQUIRED/);
  assert.throws(() => createTeacherReviewRequest({ goal: 'x', council: {}, inspection: { status: 'PARTIAL', evidence: [] } }), /TEACHER_INSPECTION_INCOMPLETE/);
});

test('teacher review contract redacts secret-like keys and requires matching request id', () => {
  const request = createTeacherReviewRequest({
    goal: 'Ajouter une compétence de test',
    council: { responses: councilResponses },
    inspection: { status: 'COMPLETE', evidence: [{ path: 'src/router.js' }] },
    spec: { purpose: 'test' },
    security: { token: 'should-not-leak', note: 'safe' },
  });
  assert.equal(request.type, 'MEL_TEACHER_REVIEW_REQUEST');
  assert.equal(request.security.token, '[REDACTED]');
  assert.throws(() => applyTeacherReview(request, { request_id: 'wrong', verdict: 'APPROVE_PLAN' }), /MISMATCH/);
  const review = applyTeacherReview(request, { request_id: request.request_id, verdict: 'APPROVE_PLAN', feedback: 'ok' });
  assert.equal(review.development_allowed, true);
});

test('development coordinator requires two distinct explicitly zero-added-cost council models', () => {
  let job = createDevelopmentJob('Créer une compétence sûre');
  assert.throws(() => advanceDevelopmentJob(job, 'COUNCIL_COMPLETE', { responses: [{ provider: 'a', model: 'x', zero_added_cost: true, summary: 'one' }] }), /COUNCIL_ZERO_COST_EVIDENCE_REQUIRED/);
  assert.throws(() => advanceDevelopmentJob(job, 'COUNCIL_COMPLETE', { responses: [
    { provider: 'a', model: 'x', zero_added_cost: true, summary: 'one' },
    { provider: 'b', model: 'y', zero_added_cost: false, summary: 'not zero' },
  ] }), /COUNCIL_ZERO_COST_EVIDENCE_REQUIRED/);
  job = advanceDevelopmentJob(job, 'COUNCIL_COMPLETE', { responses: councilResponses });
  assert.equal(job.state, DEVELOPMENT_STATES.INSPECTION_REQUIRED);
});

test('development coordinator enforces council -> inspection -> teacher -> implementation -> CI -> critique', () => {
  let job = createDevelopmentJob('Créer une compétence sûre');
  assert.equal(job.state, DEVELOPMENT_STATES.COUNCIL_REQUIRED);
  assert.throws(() => advanceDevelopmentJob(job, 'INSPECTION_COMPLETE', { status: 'COMPLETE', evidence: [{}] }), /TRANSITION_DENIED/);

  job = advanceDevelopmentJob(job, 'COUNCIL_COMPLETE', { responses: councilResponses });
  assert.equal(job.state, DEVELOPMENT_STATES.INSPECTION_REQUIRED);
  job = advanceDevelopmentJob(job, 'INSPECTION_COMPLETE', { status: 'COMPLETE', evidence: [{ path: 'src/router.js' }] });
  assert.equal(job.state, DEVELOPMENT_STATES.SPEC_READY);
  job = advanceDevelopmentJob(job, 'TEACHER_REQUESTED', { request_id: 'r1' });
  assert.equal(job.state, DEVELOPMENT_STATES.TEACHER_REVIEW);
  assert.throws(() => advanceDevelopmentJob(job, 'TEACHER_APPROVED', { verdict: 'NEEDS_CHANGES' }), /TEACHER_APPROVAL_REQUIRED/);
  job = advanceDevelopmentJob(job, 'TEACHER_APPROVED', { verdict: 'APPROVE_PLAN' });
  assert.equal(job.state, DEVELOPMENT_STATES.IMPLEMENTATION);
  assert.throws(() => advanceDevelopmentJob(job, 'IMPLEMENTATION_COMPLETE', { candidate_sha: 'abcdef1', candidate_branch: 'main' }), /CANDIDATE_EVIDENCE_REQUIRED/);
  job = advanceDevelopmentJob(job, 'IMPLEMENTATION_COMPLETE', { candidate_sha: 'abcdef1', candidate_branch: 'candidate/augmentio-core' });
  assert.equal(job.state, DEVELOPMENT_STATES.TESTING);
  assert.throws(() => advanceDevelopmentJob(job, 'TESTS_PASSED', { full_ci: 'FAILURE', augmentio: 'SUCCESS', resilience: 'SUCCESS' }), /FULL_CI_SUCCESS_REQUIRED/);
  assert.throws(() => advanceDevelopmentJob(job, 'TESTS_PASSED', { full_ci: 'SUCCESS', augmentio: 'SUCCESS', resilience: 'FAILURE' }), /RESILIENCE_TESTS_SUCCESS_REQUIRED/);
  job = advanceDevelopmentJob(job, 'TESTS_PASSED', { full_ci: 'SUCCESS', augmentio: 'SUCCESS', resilience: 'SUCCESS' });
  assert.equal(job.state, DEVELOPMENT_STATES.CRITIQUE);
  job = advanceDevelopmentJob(job, 'CRITIQUE_PASSED', { status: 'PASS' });
  assert.equal(job.state, DEVELOPMENT_STATES.READY_FOR_RELEASE);
  assert.equal(job.release_ready, true);
});

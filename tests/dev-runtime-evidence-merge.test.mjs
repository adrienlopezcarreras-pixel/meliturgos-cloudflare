import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeBridgePlan, mergeBridgeResult, normalizeBridgeTests } from '../src/dev/runtime-api.js';

const job = {
  status: 'CLAIMED',
  candidate_branch: 'candidate/mel-clean-autonomy',
  plan_json: {
    preflight: { stage: 'AI_STATE_OF_PLAY_COMPLETE' },
    approved_plan: { provider: 'workers-ai' },
  },
  tests_json: [{ name: 'test:smoke', command: 'test:smoke', passed: false }],
  result_json: {
    teacher_bridge: { status: 'ANSWERED', review: { verdict: 'APPROVE_PLAN' } },
    implementation_proposal: { status: 'READY', providers_attempted: ['a','b'] },
    bridge_preparation: { status: 'READY' },
  },
};

test('Dev Bridge result is nested without erasing Teacher, multi-AI or preparation evidence', () => {
  const merged = mergeBridgeResult(job, {
    status: 'READY_FOR_REVIEW',
    candidate_branch: 'mel-dev/job-1',
    diff_summary: 'src/example.js changed',
    tests_json: [{ name: 'test:smoke', command: 'test:smoke', passed: true, exit_code: 0 }],
    result_json: { answer: 'src/example.js', steps: ['apply','test'] },
  });
  assert.equal(merged.teacher_bridge.review.verdict, 'APPROVE_PLAN');
  assert.equal(merged.implementation_proposal.status, 'READY');
  assert.equal(merged.bridge_preparation.status, 'READY');
  assert.equal(merged.dev_bridge.status, 'READY_FOR_REVIEW');
  assert.equal(merged.dev_bridge.diff_summary, 'src/example.js changed');
  assert.equal(merged.dev_bridge.needs_repair, false);
});

test('failed bridge tests are retained as repair evidence rather than hidden', () => {
  const merged = mergeBridgeResult(job, {
    status: 'READY_FOR_REVIEW',
    tests_json: [{ name: 'test:smoke', command: 'test:smoke', passed: false, exit_code: 1, stderr: 'assertion failed' }],
    result_json: { answer: 'candidate failed tests' },
  });
  assert.equal(merged.dev_bridge.needs_repair, true);
  assert.equal(merged.dev_bridge.tests[0].passed, false);
});

test('bridge plan is stored under its own namespace and leaves Council preflight intact', () => {
  const merged = mergeBridgePlan(job, { plan_json: { steps: ['code.read','dev.apply_change','dev.test'] } });
  assert.equal(merged.preflight.stage, 'AI_STATE_OF_PLAY_COMPLETE');
  assert.equal(merged.approved_plan.provider, 'workers-ai');
  assert.deepEqual(merged.dev_bridge.steps, ['code.read','dev.apply_change','dev.test']);
});

test('bridge tests prefer actual returned test results and remain bounded', () => {
  const tests = Array.from({ length: 60 }, (_, index) => ({ name: `t${index}`, passed: true }));
  assert.equal(normalizeBridgeTests({ tests_json: tests }, []).length, 50);
  assert.deepEqual(normalizeBridgeTests({}, job.tests_json), job.tests_json);
});

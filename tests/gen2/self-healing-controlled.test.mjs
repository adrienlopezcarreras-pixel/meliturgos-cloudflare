import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSelfHealingPlan,
  executeApprovedSelfHealing,
  verifySelfHealingPlan,
} from '../../src/evolution/self-healing.js';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);

test('self healing blocks non-candidate targets before any action', async () => {
  const plan = await createSelfHealingPlan({
    evolution_id: 'job-1',
    candidate: { branch: 'main', sha: SHA_A },
    lastKnownGood: { sha: SHA_B },
    failure: { regression: true },
    created_at: 1000,
  });
  assert.equal(plan.status, 'BLOCKED_UNSAFE_TARGET');
  assert.equal(plan.action, 'NONE');
  assert.equal(plan.production_mutation_allowed, false);
  assert.equal(plan.promotion_allowed, false);
});

test('regression with verified previous candidate proposes rollback and retest', async () => {
  const plan = await createSelfHealingPlan({
    evolution_id: 'job-2',
    candidate: { branch: 'candidate/test', sha: SHA_A },
    lastKnownGood: { sha: SHA_B },
    failure: {
      regression: true,
      tests: [{ name: 'full suite', passed: false, exit_code: 1 }],
    },
    created_at: 2000,
  });
  assert.equal(plan.status, 'READY_FOR_APPROVAL');
  assert.equal(plan.action, 'ROLLBACK_AND_RETEST');
  assert.equal(plan.target.from_sha, SHA_A);
  assert.equal(plan.target.to_sha, SHA_B);
  assert.equal((await verifySelfHealingPlan(plan)).ok, true);
});

test('repairable failure without rollback target proposes repair and retest', async () => {
  const plan = await createSelfHealingPlan({
    evolution_id: 'job-3',
    candidate: { branch: 'candidate/test', sha: SHA_A },
    failure: { repairable: true, code: 'TEST_FAILURE' },
    created_at: 3000,
  });
  assert.equal(plan.action, 'REPAIR_AND_RETEST');
  assert.equal(plan.target.to_sha, null);
  assert.equal(plan.requires_explicit_approval, true);
});

test('exact approval is required and mismatched SHA is rejected', async () => {
  const plan = await createSelfHealingPlan({
    evolution_id: 'job-4',
    candidate: { branch: 'candidate/test', sha: SHA_A },
    lastKnownGood: { sha: SHA_B },
    failure: { regression: true },
    created_at: 4000,
  });

  await assert.rejects(
    executeApprovedSelfHealing(plan, {
      approval: {
        approved: true,
        plan_id: plan.plan_id,
        candidate_branch: plan.target.branch,
        from_sha: SHA_C,
        to_sha: SHA_B,
        actor: 'owner',
      },
      rollbackCandidate: async () => ({ candidate_sha: SHA_B }),
      testCandidate: async () => [{ name: 'suite', passed: true, exit_code: 0 }],
    }),
    /SELF_HEALING_APPROVAL_SHA_MISMATCH/,
  );
});

test('approved rollback stays candidate-only, retests and never auto-promotes', async () => {
  const calls = [];
  const plan = await createSelfHealingPlan({
    evolution_id: 'job-5',
    candidate: { branch: 'candidate/test', sha: SHA_A },
    lastKnownGood: { sha: SHA_B },
    failure: {
      regression: true,
      tests: [{ name: 'suite', passed: false, exit_code: 1 }],
    },
    created_at: 5000,
  });

  const result = await executeApprovedSelfHealing(plan, {
    approval: {
      approved: true,
      plan_id: plan.plan_id,
      candidate_branch: plan.target.branch,
      from_sha: SHA_A,
      to_sha: SHA_B,
      actor: 'owner',
      approved_at: 5100,
    },
    rollbackCandidate: async input => {
      calls.push({ type: 'rollback', input });
      return { candidate_sha: SHA_B, changed: true };
    },
    testCandidate: async input => {
      calls.push({ type: 'test', input });
      return [
        { name: 'targeted', passed: true, exit_code: 0 },
        { name: 'full suite', passed: true, exit_code: 0 },
      ];
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'CANDIDATE_VERIFIED');
  assert.equal(result.candidate.branch, 'candidate/test');
  assert.equal(result.candidate.sha, SHA_B);
  assert.equal(result.production_touched, false);
  assert.equal(result.promotion_allowed, false);
  assert.equal(result.next, 'HUMAN_OR_RELEASE_GATE_REVIEW');
  assert.deepEqual(calls.map(row => row.type), ['rollback', 'test']);
});

test('a failed retest blocks promotion after rollback', async () => {
  const plan = await createSelfHealingPlan({
    evolution_id: 'job-6',
    candidate: { branch: 'candidate/test', sha: SHA_A },
    lastKnownGood: { sha: SHA_B },
    failure: { regression: true },
    created_at: 6000,
  });

  const result = await executeApprovedSelfHealing(plan, {
    approval: {
      approved: true,
      plan_id: plan.plan_id,
      candidate_branch: plan.target.branch,
      from_sha: SHA_A,
      to_sha: SHA_B,
      actor: 'teacher',
    },
    rollbackCandidate: async () => ({ candidate_sha: SHA_B }),
    testCandidate: async () => [
      { name: 'targeted', passed: true, exit_code: 0 },
      { name: 'full suite', passed: false, exit_code: 1 },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'TESTS_FAILED');
  assert.equal(result.promotion_allowed, false);
  assert.equal(result.next, 'REPAIR_OR_ESCALATE');
});

test('repair path requires a new candidate SHA and a successful test run', async () => {
  const plan = await createSelfHealingPlan({
    evolution_id: 'job-7',
    candidate: { branch: 'candidate/test', sha: SHA_A },
    failure: { repairable: true, code: 'TARGETED_TEST_FAILURE' },
    created_at: 7000,
  });

  const result = await executeApprovedSelfHealing(plan, {
    approval: {
      approved: true,
      plan_id: plan.plan_id,
      candidate_branch: plan.target.branch,
      from_sha: SHA_A,
      actor: 'owner',
    },
    repairCandidate: async () => ({ candidate_sha: SHA_C, changed_files: ['src/a.js'] }),
    testCandidate: async ({ candidate_sha }) => {
      assert.equal(candidate_sha, SHA_C);
      return [{ name: 'full suite', passed: true, exit_code: 0 }];
    },
  });

  assert.equal(result.status, 'CANDIDATE_VERIFIED');
  assert.equal(result.candidate.sha, SHA_C);
  assert.equal(result.production_touched, false);
  assert.equal(result.promotion_allowed, false);
});

test('tampered self-healing plans fail digest verification', async () => {
  const plan = await createSelfHealingPlan({
    evolution_id: 'job-8',
    candidate: { branch: 'candidate/test', sha: SHA_A },
    failure: { repairable: true },
    created_at: 8000,
  });
  const tampered = structuredClone(plan);
  tampered.target.branch = 'candidate/other';
  const verified = await verifySelfHealingPlan(tampered);
  assert.equal(verified.ok, false);
  assert.equal(verified.code, 'SELF_HEALING_PLAN_DIGEST_MISMATCH');
});

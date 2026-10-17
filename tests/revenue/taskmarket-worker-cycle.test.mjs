import test from 'node:test';
import assert from 'node:assert/strict';
import { runTaskmarketWorkerCycle, feedbackToLoraCandidate } from '../../src/revenue/taskmarket-worker-cycle.js';

const task = {
  id: '0x123',
  status: 'open',
  description: 'Normalize this provided JSON dataset into the requested schema.',
  reward: '1000000',
  platformFeeBps: 750,
  mode: 'bounty',
  stakeRequired: false,
  claimedBy: null,
  expiryTime: new Date(Date.now() + 3600000).toISOString(),
};
const base = {
  listTasks: async () => ({ tasks: [task] }),
  assessWithCouncil: async () => ({
    eligible: true,
    confidenceBps: 9500,
    category: 'data-processing',
    machineVerifiable: true,
    requiresHuman: false,
    requiresPhysicalWorld: false,
    requiresSecrets: false,
    requestsUnsafeAction: false,
    estimatedComputeCostMicros: 100000,
  }),
  solveWithMel: async () => ({ content: '{}', sha256: 'a'.repeat(64) }),
  validateWithCouncil: async () => ({ passed: true, machineVerifiable: true, summary: 'schema-valid' }),
  recordOutcome: async () => {},
  policy: { minimumProfitMicros: 100000, minimumMarginBps: 1000 },
};

test('validates work but does not submit while gates are closed', async () => {
  let submits = 0;
  const r = await runTaskmarketWorkerCycle({ ...base, submitResult: async () => { submits++; return { success: true, submissionId: 's1' }; } });
  assert.equal(r.decisions[0].status, 'READY_NOT_SUBMITTED');
  assert.equal(r.decisions[0].reason, 'AUTOMATIC_SUBMISSION_DISABLED');
  assert.equal(r.decisions[0].economics.expectedProfitMicros, 825000);
  assert.equal(submits, 0);
});

test('skips low-confidence Council assessments', async () => {
  const r = await runTaskmarketWorkerCycle({ ...base, assessWithCouncil: async () => ({ eligible: true, confidenceBps: 5000 }) });
  assert.equal(r.decisions[0].reason, 'COUNCIL_DID_NOT_APPROVE');
});

test('refuses unvalidated model output', async () => {
  const r = await runTaskmarketWorkerCycle({ ...base, validateWithCouncil: async () => ({ passed: false, machineVerifiable: false }) });
  assert.equal(r.decisions[0].reason, 'OUTPUT_VALIDATION_FAILED');
});

test('loss-making candidate never reaches the submit adapter even with the other gates open', async () => {
  let submits = 0;
  const r = await runTaskmarketWorkerCycle({
    ...base,
    assessWithCouncil: async () => ({ ...await base.assessWithCouncil(), estimatedComputeCostMicros: 950000 }),
    policy: { minimumProfitMicros: 100000, minimumMarginBps: 1000, submissionEnabled: true, legalAccepted: true, workerIdentityReady: true, outputValidatorVerified: true, spendCapApproved: true },
    submitResult: async () => { submits++; return { success: true, submissionId: 's1' }; },
  });
  assert.equal(r.decisions[0].status, 'REJECTED');
  assert.equal(r.decisions[0].reason, 'TASK_POLICY_EXPECTED_PROFIT_TOO_LOW');
  assert.equal(submits, 0);
});

test('profitable candidate still cannot submit without independent validator implementation approval', async () => {
  let submits = 0;
  const r = await runTaskmarketWorkerCycle({
    ...base,
    policy: { minimumProfitMicros: 100000, minimumMarginBps: 1000, submissionEnabled: true, legalAccepted: true, workerIdentityReady: true, spendCapApproved: true, outputValidatorVerified: false },
    submitResult: async () => { submits++; return { success: true, submissionId: 's1' }; },
  });
  assert.equal(r.decisions[0].status, 'REJECTED');
  assert.equal(r.decisions[0].reason, 'TASK_POLICY_OUTPUT_VALIDATOR_NOT_VERIFIED');
  assert.equal(submits, 0);
});

test('does not submit until legal setup and validation are verified', async () => {
  let submits = 0;
  const r = await runTaskmarketWorkerCycle({
    ...base,
    policy: { minimumProfitMicros: 100000, minimumMarginBps: 1000, submissionEnabled: true },
    submitResult: async () => { submits++; return { success: true, submissionId: 's1' }; },
  });
  assert.equal(r.decisions[0].status, 'REJECTED');
  assert.equal(r.decisions[0].reason, 'TASK_POLICY_OPERATOR_SETUP_NOT_CONFIRMED');
  assert.equal(submits, 0);
});

test('submits only with all setup, economics and spending gates explicitly enabled', async () => {
  let payload;
  const r = await runTaskmarketWorkerCycle({
    ...base,
    policy: { minimumProfitMicros: 100000, minimumMarginBps: 1000, submissionEnabled: true, legalAccepted: true, workerIdentityReady: true, outputValidatorVerified: true, spendCapApproved: true },
    submitResult: async (x) => { payload = x; return { success: true, submissionId: 's1' }; },
  });
  assert.equal(r.submitted, 1);
  assert.equal(r.decisions[0].status, 'SUBMITTED_PENDING_ACCEPTANCE');
  assert.equal(payload.task.id, '0x123');
  assert.equal(payload.economics.expectedProfitMicros, 825000);
  assert.equal(r.incomeStatus, 'NOT_SETTLED_UNTIL_ACCEPTED_AND_PAID');
});

test('unknown stake or claim state cannot reach the submission adapter', async () => {
  const fullPolicy = { minimumProfitMicros: 100000, minimumMarginBps: 1000, submissionEnabled: true, legalAccepted: true, workerIdentityReady: true, outputValidatorVerified: true, spendCapApproved: true };
  for (const [field, expectedReason] of [['stakeRequired', 'TASK_POLICY_STAKE_REQUIREMENT_UNVERIFIED'], ['claimedBy', 'TASK_POLICY_CLAIM_STATUS_UNVERIFIED']]) {
    const unknown = { ...task };
    delete unknown[field];
    let submits = 0;
    const r = await runTaskmarketWorkerCycle({
      ...base,
      listTasks: async () => ({ tasks: [unknown] }),
      policy: fullPolicy,
      submitResult: async () => { submits++; return { success: true, submissionId: 's1' }; },
    });
    assert.equal(r.decisions[0].status, 'REJECTED');
    assert.equal(r.decisions[0].reason, expectedReason);
    assert.equal(submits, 0);
  }
});

test('only turns accepted and settled real feedback into a review-required LoRA candidate', () => {
  const evidence = { taskId: '0x123', candidateSha256: 'b'.repeat(64) };
  assert.equal(feedbackToLoraCandidate({ status: 'rejected', payoutSettled: false, rating: 30 }, evidence), null);
  const x = feedbackToLoraCandidate({ status: 'accepted', payoutSettled: true, rating: 93, feedbackText: 'Good' }, evidence);
  assert.equal(x.trainingStatus, 'REVIEW_REQUIRED');
  assert.equal(x.rating, 93);
});

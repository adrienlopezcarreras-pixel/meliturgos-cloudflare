import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { repairBudgetDecision, unansweredExhaustedRepair, MAX_OWNER_MAX_REPAIR_ATTEMPTS } from '../src/evolution/autonomy-runtime-core.js';

const googleapis = [{ name: 'syntax-and-imports', passed: false, error: 'Unresolved import in src/evolution/google-tools.js: googleapis' }];

test('a failure the mentor has not seen does not exhaust the repair budget', () => {
  const decision = repairBudgetDecision({
    attempts: MAX_OWNER_MAX_REPAIR_ATTEMPTS,
    failedTests: googleapis,
    presentedSignatures: [],
  });
  assert.equal(decision.action, 'REPAIR');
  assert.equal(decision.unseen, true);
  assert.deepEqual(decision.nextPresented, [googleapis[0].error]);
});

test('the same failure, once shown to the mentor, exhausts at the cap', () => {
  const decision = repairBudgetDecision({
    attempts: MAX_OWNER_MAX_REPAIR_ATTEMPTS,
    failedTests: googleapis,
    presentedSignatures: [googleapis[0].error],
  });
  assert.equal(decision.action, 'EXHAUST');
});

test('an exhausted job reopens only when its failure text was never presented', () => {
  const job = {
    status: 'FAILED',
    error: 'MAX_REPAIR_ATTEMPTS_EXHAUSTED',
    result_json: {
      repair_cycle: { attempts: 8, failed_tests: googleapis, presented_signatures: [] },
    },
  };
  assert.equal(unansweredExhaustedRepair(job)?.action, 'REPAIR');
  job.result_json.repair_cycle.presented_signatures = [googleapis[0].error];
  assert.equal(unansweredExhaustedRepair(job), null);
});

test('a waiting teacher review is restored instead of being selected as runnable', async () => {
  const source = await readFile(new URL('../src/evolution/autonomy-runtime-core.js', import.meta.url), 'utf8');
  assert.match(source, /status: 'WAITING_TEACHER', error: null/);
  assert.match(source, /teacher\?\.reused !== true/);
  assert.match(source, /UNANSWERED_FAILURE/);
  const mentor = await readFile(new URL('../src/learning/mentor-engine.js', import.meta.url), 'utf8');
  assert.match(mentor, /N’invente pas un module absent/);
});

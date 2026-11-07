import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { findingsForRepair, measureOutcomeRepairs, recordRepairs, MAX_ATTEMPTS } from '../src/diagnostics/outcome-loop.js';

const DAY = 86_400_000;
const T0 = Date.parse('2026-10-26T05:00:00Z');
const finding = code => ({ code, detail: code + ' constaté' });

test('a repaired finding gone from the next audit is recorded as resolved', () => {
  const ledger = recordRepairs({}, [finding('MEMORY_UNCONSOLIDATED')], { now: T0 });
  const after = measureOutcomeRepairs(ledger, [], { measured: true, now: T0 + 7 * DAY });
  assert.deepEqual(after.resolved.map(r => r.code), ['MEMORY_UNCONSOLIDATED']);
  assert.deepEqual(after.ledger, {});
});

test('an unmeasured pass never counts as a resolution', () => {
  const ledger = recordRepairs({}, [finding('BACKUP_STALE')], { now: T0 });
  const after = measureOutcomeRepairs(ledger, [], { measured: false, now: T0 + 7 * DAY });
  assert.deepEqual(after.resolved, []);
  assert.ok(after.ledger.BACKUP_STALE);
});

test('a finding still present after its grace week reopens the repair with the proof', () => {
  let ledger = recordRepairs({}, [finding('WORK_CYCLES_INTERRUPTED')], { now: T0 });
  const early = measureOutcomeRepairs(ledger, [finding('WORK_CYCLES_INTERRUPTED')], { measured: true, now: T0 + 2 * DAY });
  assert.deepEqual(early.persisting, [], 'the repair gets its week first');
  const late = measureOutcomeRepairs(ledger, [finding('WORK_CYCLES_INTERRUPTED')], { measured: true, now: T0 + 7 * DAY });
  assert.deepEqual(late.persisting, [{ code: 'WORK_CYCLES_INTERRUPTED', attempts: 1 }]);
  const [sent] = findingsForRepair([finding('WORK_CYCLES_INTERRUPTED')], late);
  assert.equal(sent.reopened, true);
  assert.match(sent.detail, /toujours présent après 1 réparation/);
  ledger = recordRepairs(late.ledger, [sent], { now: T0 + 7 * DAY });
  assert.equal(ledger.WORK_CYCLES_INTERRUPTED.attempts, 2);
  assert.equal(recordRepairs(ledger, [sent], { now: T0 + 8 * DAY }).WORK_CYCLES_INTERRUPTED.attempts, 2, 'no double count inside the grace week');
});

test('after MAX_ATTEMPTS ineffective repairs the finding is escalated, not looped', () => {
  const ledger = { CHAT_OFF_TOPIC_ANSWERS: { repaired_at: T0, attempts: MAX_ATTEMPTS } };
  const after = measureOutcomeRepairs(ledger, [finding('CHAT_OFF_TOPIC_ANSWERS')], { measured: true, now: T0 + 7 * DAY });
  assert.deepEqual(after.escalated, [{ code: 'CHAT_OFF_TOPIC_ANSWERS', attempts: MAX_ATTEMPTS }]);
  assert.deepEqual(findingsForRepair([finding('CHAT_OFF_TOPIC_ANSWERS')], after), []);
});

test('the self-audit supervisor measures, reopens and persists the loop', async () => {
  const source = await readFile('src/diagnostics/self-audit-supervisor.js', 'utf8');
  assert.match(source, /measureOutcomeRepairs\(state\.outcome_repairs/);
  assert.match(source, /':reopen-'/);
  assert.match(source, /outcome_repairs: outcomeRepairs/);
  assert.match(source, /outcome_loop: \{/);
});

// MEL-AUDIT-07: one job per persistent finding; resolved only by a measure.
test('a persistent finding is linked to a single job and resolved only when a later measure confirms it is gone', async () => {
  const { recordRepairs, measureOutcomeRepairs, repairJobFor, REPAIR_GRACE_MS } = await import('../src/diagnostics/outcome-loop.js');
  const finding = { code: 'CHAT_OFF_TOPIC', detail: 'hors sujet' };
  let ledger = recordRepairs({}, [finding], { now: 1000, jobId: 'job-a' });
  ledger = recordRepairs(ledger, [finding], { now: 2000, jobId: 'job-b' });
  assert.equal(repairJobFor(ledger, 'CHAT_OFF_TOPIC'), 'job-a', 'inside its grace week the finding keeps one job');
  assert.equal(ledger.CHAT_OFF_TOPIC.attempts, 1);
  const unmeasured = measureOutcomeRepairs(ledger, [], { measured: false, now: 3000 });
  assert.deepEqual(unmeasured.resolved, [], 'no measure, no resolution');
  const stillThere = measureOutcomeRepairs(ledger, [finding], { measured: true, now: 1000 + REPAIR_GRACE_MS + 1 });
  assert.deepEqual(stillThere.resolved, []);
  assert.equal(stillThere.persisting[0].code, 'CHAT_OFF_TOPIC');
  const gone = measureOutcomeRepairs(ledger, [], { measured: true, now: 5000 });
  assert.deepEqual(gone.resolved.map(row => [row.code, row.job_id]), [['CHAT_OFF_TOPIC', 'job-a']]);
  assert.equal(repairJobFor(gone.ledger, 'CHAT_OFF_TOPIC'), null);
});

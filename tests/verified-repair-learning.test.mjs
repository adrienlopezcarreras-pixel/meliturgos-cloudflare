import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeBridgeResult } from '../src/dev/runtime-api.js';
import { buildVerifiedRepairCorrections } from '../src/teachers/github-completion-reconciler.js';

test('bridge result preserves failed attempt before a repair result overwrites current state', () => {
  const failedJob = { result_json: { dev_bridge: { status: 'REPAIR_REQUIRED', diff_summary: 'bad patch', needs_repair: true, received_at: '2026-09-13T10:00:00Z', tests: [{ name: 'unit', passed: false }] } } };
  const merged = mergeBridgeResult(failedJob, { status: 'READY_FOR_REVIEW', diff_summary: 'fixed patch', tests: [{ name: 'unit', passed: true }], result_json: {} });
  assert.equal(merged.dev_bridge.needs_repair, false);
  assert.equal(merged.dev_bridge_history.length, 1);
  assert.equal(merged.dev_bridge_history[0].needs_repair, true);
  assert.equal(merged.dev_bridge_history[0].tests[0].passed, false);
});

test('verified repair becomes a structured validated correction only with final CI proof', () => {
  const job = { id: 'job-1', goal: 'Fix the learning loop', optional_context: { roadmap_id: 'MEL-EVOL-03' }, result_json: { dev_bridge_history: [{ status: 'REPAIR_REQUIRED', diff_summary: 'first approach', needs_repair: true, received_at: '2026-09-13T10:00:00Z', tests: [{ name: 'learning-loop', passed: false }] }], dev_bridge: { status: 'READY_FOR_REVIEW', diff_summary: 'corrected approach', needs_repair: false, tests: [{ name: 'learning-loop', passed: true }] } } };
  const record = { candidate_sha: 'a'.repeat(40), summary: 'corrected approach', tests: [{ name: 'learning-loop', passed: true }] };
  const proposal = { selected: { text: 'corrected approach' } };
  const ci = { workflow: 'full-candidate-ci', run_id: 42, head_sha: 'a'.repeat(40) };
  const rows = buildVerifiedRepairCorrections(job, record, proposal, ci);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].validated, true);
  assert.equal(rows[0].source, 'runtime-test-repair');
  assert.match(rows[0].rationale, /CAUSE:/);
  assert.match(rows[0].rationale, /METHOD:/);
  assert.match(rows[0].rationale, /PROOF:/);
  assert.ok(rows[0].tests.includes('learning-loop:failed-before-repair'));
  assert.ok(rows[0].tests.includes('learning-loop:passed-after-repair'));
});

test('a clean first-pass completion does not invent a repair correction', () => {
  const job = { id: 'job-2', goal: 'Clean work', result_json: { dev_bridge_history: [], dev_bridge: { needs_repair: false, tests: [{ name: 'unit', passed: true }] } } };
  const rows = buildVerifiedRepairCorrections(job, { candidate_sha: 'b'.repeat(40), summary: 'done', tests: [{ name: 'unit', passed: true }] }, { selected: { text: 'done' } }, { workflow: 'full-candidate-ci', run_id: 7, head_sha: 'b'.repeat(40) });
  assert.deepEqual(rows, []);
});

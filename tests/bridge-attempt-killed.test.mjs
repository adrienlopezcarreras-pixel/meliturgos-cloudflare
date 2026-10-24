import test from 'node:test';
import assert from 'node:assert/strict';
import { markBridgePreparationAttempt, persistBridgePreparationDiagnostic, BRIDGE_ATTEMPT_KILLED_AFTER_MS } from '../src/evolution/autonomy-runtime-core.js';

function repo(job) {
  let row = structuredClone(job);
  return {
    async get() { return structuredClone(row); },
    async update(id, patch) { row = { ...row, ...structuredClone(patch) }; return structuredClone(row); },
    get row() { return row; },
  };
}

test('a Mentor attempt cut by the platform is counted, and three cuts move MAX to the next mission', async () => {
  const r = repo({ id: 'j', status: 'TEACHER_APPROVED', result_json: {} });
  let now = 1_000_000;
  const first = await markBridgePreparationAttempt(r, 'j', { now });
  assert.equal(first.exhausted, false);
  assert.equal(r.row.result_json.bridge_preparation_attempt.killed, 0);
  for (let cut = 1; cut <= 2; cut += 1) {
    now += BRIDGE_ATTEMPT_KILLED_AFTER_MS + 1;
    const next = await markBridgePreparationAttempt(r, 'j', { now });
    assert.equal(next.killed, cut);
    assert.equal(next.exhausted, false);
  }
  now += BRIDGE_ATTEMPT_KILLED_AFTER_MS + 1;
  const last = await markBridgePreparationAttempt(r, 'j', { now });
  assert.equal(last.exhausted, true);
  assert.equal(r.row.result_json.bridge_preparation_diagnostic.code, 'BRIDGE_PREPARATION_KILLED');
  assert.equal(r.row.result_json.autonomy_deferral.exhausted, true);
  assert.equal(r.row.result_json.bridge_preparation_attempt, undefined);
});

test('an attempt that finishes clears its marker, even with an unchanged diagnostic', async () => {
  const diagnostic = { status: 'NOT_READY', code: 'MENTOR_NO_VALID_CODE_PROPOSAL', failures: [] };
  const r = repo({ id: 'j', status: 'TEACHER_APPROVED', result_json: {} });
  await persistBridgePreparationDiagnostic(r, 'j', diagnostic);
  await markBridgePreparationAttempt(r, 'j', { now: 5 });
  await persistBridgePreparationDiagnostic(r, 'j', diagnostic);
  assert.equal(r.row.result_json.bridge_preparation_attempt, undefined);
  const again = await markBridgePreparationAttempt(r, 'j', { now: 5 + 10 * BRIDGE_ATTEMPT_KILLED_AFTER_MS });
  assert.equal(again.killed, 0);
});

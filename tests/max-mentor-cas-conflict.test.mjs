import test from 'node:test';
import assert from 'node:assert/strict';
import { persistBridgePreparationDiagnostic, markBridgePreparationAttempt } from '../src/evolution/autonomy-runtime-core.js';

function collidingRepository(initial) {
  let row = structuredClone(initial);
  let collide = true;
  return {
    async get() { return structuredClone(row); },
    async update(id, patch) {
      assert.equal(id, row.id);
      if (collide) {
        collide = false;
        row.result_json = { ...row.result_json, unrelated_heartbeat: { observed: true } };
        const error = new Error('JOB_UPDATE_CONFLICT');
        error.code = 'JOB_UPDATE_CONFLICT';
        throw error;
      }
      row = { ...row, ...structuredClone(patch) };
      return structuredClone(row);
    },
  };
}

test('MAX retains rejected Mentor history after unrelated D1 CAS conflict', async () => {
  const repo = collidingRepository({
    id: 'mel-autonomy-founder-07', status: 'TEACHER_APPROVED',
    requested_by: 'mel-autonomy',
    result_json: { bridge_preparation_attempt: { started_at: 111, killed: 0 } },
  });
  await persistBridgePreparationDiagnostic(repo, 'mel-autonomy-founder-07', {
    status: 'NOT_READY', code: 'MENTOR_NO_VALID_CODE_PROPOSAL',
    failures: [{ stage: 'initial', code: 'MENTOR_TEST_REQUIRED', detail: 'missing regression' }],
  });
  const result = (await repo.get()).result_json;
  assert.equal(result.unrelated_heartbeat.observed, true);
  assert.equal(result.bridge_preparation_diagnostic.code, 'MENTOR_NO_VALID_CODE_PROPOSAL');
  assert.equal(result.mentor_attempt_history.length, 1);
  assert.equal(result.mentor_attempt_history[0].error, 'MENTOR_TEST_REQUIRED');
  assert.equal(result.bridge_preparation_attempt, undefined);
  assert.equal(result.autonomy_deferral.code, 'MENTOR_NO_VALID_CODE_PROPOSAL');
});

test('MAX clears stale Mentor history and attempt marker on READY CAS retry', async () => {
  const repo = collidingRepository({
    id: 'mel-autonomy-founder-07', status: 'TEACHER_APPROVED',
    requested_by: 'mel-autonomy',
    result_json: {
      mentor_attempt_history: [{ name: 'initial', error: 'MENTOR_TEST_REQUIRED' }],
      bridge_preparation_attempt: { started_at: 111, killed: 0 },
      bridge_preparation_diagnostic: { status: 'NOT_READY', code: 'MENTOR_NO_VALID_CODE_PROPOSAL' },
      autonomy_deferral: { code: 'MENTOR_NO_VALID_CODE_PROPOSAL', phase: 'bridge', retry_after: 9999999999999 },
    },
  });
  await persistBridgePreparationDiagnostic(repo, 'mel-autonomy-founder-07', { status: 'READY' });
  const result = (await repo.get()).result_json;
  assert.equal(result.unrelated_heartbeat.observed, true);
  assert.equal(result.bridge_preparation_diagnostic.status, 'READY');
  assert.equal(result.mentor_attempt_history, undefined);
  assert.equal(result.bridge_preparation_attempt, undefined);
  assert.equal(result.autonomy_deferral, undefined);
});

test('MAX CAS conflict with a competing Mentor round preserves the winner history', async () => {
  let row = {
    id: 'mel-autonomy-founder-07', status: 'TEACHER_APPROVED',
    requested_by: 'mel-autonomy',
    result_json: { mentor_attempt_history: [{ name: 'initial', error: 'MENTOR_JSON_INVALID' }] },
  };
  let first = true;
  const repo = {
    async get() { return structuredClone(row); },
    async update(id, patch) {
      assert.equal(id, row.id);
      if (first) {
        first = false;
        row = { ...row, result_json: {
          ...row.result_json,
          mentor_attempt_history: [
            ...row.result_json.mentor_attempt_history,
            { name: 'repair', error: 'MENTOR_UNINSPECTED_EDIT' },
          ],
        } };
        const error = new Error('JOB_UPDATE_CONFLICT');
        error.code = 'JOB_UPDATE_CONFLICT';
        throw error;
      }
      row = { ...row, ...structuredClone(patch) };
      return structuredClone(row);
    },
  };
  await persistBridgePreparationDiagnostic(repo, row.id, {
    status: 'NOT_READY', code: 'MENTOR_NO_VALID_CODE_PROPOSAL',
    failures: [{ stage: 'initial', code: 'MENTOR_TEST_REQUIRED' }],
  });
  const latest = (await repo.get()).result_json;
  assert.deepEqual(latest.mentor_attempt_history, [
    { name: 'initial', error: 'MENTOR_JSON_INVALID' },
    { name: 'repair', error: 'MENTOR_UNINSPECTED_EDIT' },
  ], 'a competing Mentor writer must not lose its history');
  assert.equal(latest.bridge_preparation_diagnostic, undefined,
    'do not persist a stale decision once a competing Mentor round changed');
});

test('MAX cannot resurrect a bridge attempt after a concurrent Mentor READY CAS update', async () => {
  let row = {
    id: 'mel-autonomy-founder-07', status: 'TEACHER_APPROVED',
    requested_by: 'mel-autonomy', result_json: {},
  };
  let collision = true;
  let successfulWrites = 0;
  const repo = {
    async get() { return structuredClone(row); },
    async update(id, patch) {
      assert.equal(id, row.id);
      if (collision) {
        collision = false;
        // Another runtime worker finished preparing the bridge before our
        // stale in-flight marker could be persisted.
        row = { ...row, result_json: {
          ...row.result_json,
          bridge_preparation_diagnostic: {
            status: 'READY', code: null, observed_at: '2026-11-04T11:00:00.000Z',
          },
        } };
        const error = new Error('JOB_UPDATE_CONFLICT');
        error.code = 'JOB_UPDATE_CONFLICT';
        throw error;
      }
      successfulWrites += 1;
      row = { ...row, ...structuredClone(patch) };
      return structuredClone(row);
    },
  };
  const response = await markBridgePreparationAttempt(repo, row.id, { now: 1793790300000 });
  const current = await repo.get(row.id);
  assert.equal(response.claimed, false, 'losing a CAS conflict does not grant a bridge claim');
  assert.equal(response.job.result_json.bridge_preparation_diagnostic.status, 'READY');
  assert.equal(current.result_json.bridge_preparation_diagnostic.status, 'READY');
  assert.equal(current.result_json.bridge_preparation_attempt, undefined,
    'a completed preparation must never regain a stale in-flight marker');
  assert.equal(successfulWrites, 0, 'a competing Mentor decision must abort stale CAS retry');
});

test('a live Bridge claim waits instead of counting as a lost write', async () => {
  const { bridgePreparationHold } = await import('../src/evolution/autonomy-runtime-core.js');
  assert.equal(bridgePreparationHold({ in_progress: true, claimed: false }).code, 'BRIDGE_PREPARATION_IN_PROGRESS');
  assert.equal(bridgePreparationHold({ claimed: false }).code, 'BRIDGE_PREPARATION_CLAIM_NOT_PERSISTED');
  assert.equal(bridgePreparationHold({ exhausted: true }).code, 'BRIDGE_PREPARATION_KILLED');
  assert.equal(bridgePreparationHold({ claimed: true }), null);
});

test('MAX Bridge claim stays exclusive for a live attempt and rotates only after expiry', async () => {
  let row = { id: 'founder-07', status: 'TEACHER_APPROVED', result_json: {} };
  let writes = 0;
  const repo = {
    async get() { return structuredClone(row); },
    async update(id, patch) {
      assert.equal(id, row.id);
      writes += 1;
      row = { ...row, ...structuredClone(patch) };
      return structuredClone(row);
    },
  };
  const first = await markBridgePreparationAttempt(repo, row.id, { now: 1_000_000 });
  assert.equal(first.claimed, true);
  assert.match(first.job.result_json.bridge_preparation_attempt.attempt_id,
    /^[a-f0-9-]{36}$/i);
  const firstId = first.job.result_json.bridge_preparation_attempt.attempt_id;
  const concurrent = await markBridgePreparationAttempt(repo, row.id, { now: 1_000_001 });
  assert.equal(concurrent.claimed, false);
  assert.equal(concurrent.in_progress, true);
  assert.equal(writes, 1, 'a second tick must not spend a write or a provider call');
  assert.equal(row.result_json.bridge_preparation_attempt.attempt_id, firstId);
  const expired = await markBridgePreparationAttempt(repo, row.id, {
    now: 1_000_000 + 3 * 60_000 + 1,
  });
  assert.equal(expired.claimed, true, 'only an expired claim can be replaced');
  assert.equal(expired.killed, 1);
  assert.equal(writes, 2);
  assert.notEqual(expired.job.result_json.bridge_preparation_attempt.attempt_id, firstId);
});

test('MAX keeps a future-dated Bridge attempt passive until the lease can be assessed', async () => {
  const row = { id: 'founder-07', status: 'TEACHER_APPROVED', result_json: {
    bridge_preparation_attempt: { started_at: 1_500_000, killed: 0, attempt_id: 'other-worker' },
  } };
  const repo = {
    async get() { return structuredClone(row); },
    async update() { throw new Error('A future-dated claim must not be replaced'); },
  };
  const pending = await markBridgePreparationAttempt(repo, row.id, { now: 1_000_000 });
  assert.equal(pending.claimed, false);
  assert.equal(pending.in_progress, true);
  assert.equal(pending.job.result_json.bridge_preparation_attempt.attempt_id, 'other-worker');
});

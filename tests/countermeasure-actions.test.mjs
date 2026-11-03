import test from 'node:test';
import assert from 'node:assert/strict';
import { allLifeEvents, applyLifeCountermeasure } from '../src/continuity/life-contingency.js';
import { bindCountermeasureActions } from '../src/continuity/countermeasure-actions.js';

function repository() {
  const jobs = [{ id: 'job-1', status: 'READY_FOR_REVIEW', result_json: {}, updated_at: 1 }];
  return {
    jobs,
    async list() { return jobs; },
    async listActiveAutonomyJobs() { return jobs; },
    async update(id, patch) {
      const job = jobs.find(row => row.id === id);
      Object.assign(job, patch);
      return job;
    },
  };
}

test('every countermeasure is bound to an action', async () => {
  const calls = [];
  const actions = bindCountermeasureActions({
    repository: repository(),
    setMax: async () => { calls.push('max'); },
    keepMax: async () => { calls.push('keep'); },
    supervisor: { ensureNextJob: async () => { calls.push('next'); } },
    previousVersionId: 'version-1',
    rollbackWorker: async (version) => { calls.push(version); return { ok: true }; },
    openPrivateCopy: async () => { calls.push('kit'); return { ok: true }; },
    restoreBackupBytes: async () => { calls.push('backup'); return { ok: true }; },
  });
  const recordedOnly = new Set(['KEEP_PREVIOUS_SHA','DO_NOT_START_SECOND_RELEASE','KEEP_SOURCE','ROLLBACK_TO_SOURCE','DO_NOT_MERGE','OPEN_PRIVATE_KIT_NOT_PUBLIC_SHARD']);
  for (const event of allLifeEvents()) {
    if (event.countermeasure === 'KEEP_PAUSE') continue;
    const result = await applyLifeCountermeasure(event.id, actions);
    const noRecovery = event.id === 'MAX_STALLED';
    assert.equal(result.applied, !noRecovery, event.id);
    assert.equal(result.activation_performed, !noRecovery && !recordedOnly.has(event.countermeasure), event.id);
    if (noRecovery) assert.equal(result.reason, 'NO_RECOVERABLE_JOB');
  }
  assert.ok(calls.includes('version-1'));
  assert.ok(calls.includes('kit'));
  assert.ok(calls.includes('backup'));
  assert.ok(calls.includes('next'));
});

test('a rollback without a previous version does not pretend to deploy', async () => {
  let called = false;
  const actions = bindCountermeasureActions({
    repository: repository(),
    rollbackWorker: async () => { called = true; return { ok: true }; },
  });
  const result = await applyLifeCountermeasure('UPDATE_SMOKE_FAILED', actions);
  assert.equal(result.applied, false);
  assert.equal(result.reason, 'PREVIOUS_VERSION_REQUIRED');
  assert.equal(called, false);
});

test('successive contingency decisions retain a bounded audit history', async () => {
  const store = repository();
  const actions = bindCountermeasureActions({ repository: store });
  assert.equal((await actions.note('DO_NOT_DEPLOY')).ok, true);
  assert.equal((await actions.note('PUBLIC_MAP_ONLY')).ok, true);
  assert.deepEqual(
    store.jobs[0].result_json.countermeasure_history.map(row => row.code),
    ['DO_NOT_DEPLOY', 'PUBLIC_MAP_ONLY'],
  );
  assert.equal(store.jobs[0].result_json.countermeasure.code, 'PUBLIC_MAP_ONLY');
  assert.equal(store.jobs[0].status, 'READY_FOR_REVIEW');
});

test('a note without an active job is not falsely counted as applied', async () => {
  const store = repository();
  store.jobs.length = 0;
  const result = await bindCountermeasureActions({ repository: store }).note('DO_NOT_DEPLOY');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'NO_ACTIVE_JOB');
});

test('recording a contingency note preserves the existing mission error', async () => {
  const store = repository();
  store.jobs[0].error = 'MISSION_TEST_EVIDENCE_REQUIRED';
  const result = await bindCountermeasureActions({ repository: store }).note('DO_NOT_DEPLOY');
  assert.equal(result.ok, true);
  assert.equal(store.jobs[0].error, 'MISSION_TEST_EVIDENCE_REQUIRED');
});

test('requeue only succeeds after a real mission status transition', async () => {
  const store = repository();
  const actions = bindCountermeasureActions({ repository: store });
  const first = await actions.requeue();
  assert.equal(first.ok, true);
  assert.equal(first.recovered, 1);
  assert.equal(store.jobs[0].status, 'QUEUED');
  const again = await actions.requeue();
  assert.equal(again.ok, false);
  assert.equal(again.code, 'NO_RECOVERABLE_JOB');
  assert.equal(again.recovered, 0);
});

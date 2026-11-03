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
  for (const event of allLifeEvents()) {
    if (event.countermeasure === 'KEEP_PAUSE') continue;
    const result = await applyLifeCountermeasure(event.id, actions);
    assert.equal(result.applied, true, event.id);
    assert.equal(result.activation_performed, true, event.id);
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { allLifeEvents, applyLifeCountermeasure } from '../src/continuity/life-contingency.js';
import { bindCountermeasureActions, maxControlProof } from '../src/continuity/countermeasure-actions.js';

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
    setMax: async () => { calls.push('max'); return { ok: true, max_active: true }; },
    keepMax: async () => { calls.push('keep'); return { ok: true, max_active: true }; },
    supervisor: { ensureNextJob: async () => { calls.push('next'); return { created: true, job: { id: 'new-job' } }; } },
    previousVersionId: 'version-1',
    rollbackWorker: async (version) => { calls.push(version); return { ok: true }; },
    openPrivateCopy: async () => { calls.push('kit'); return { ok: true }; },
    ownerApprovedRecovery: true, // explicit trusted approval for this fixture only
    rebuildFromPrivateKit: async () => { calls.push('rebuild'); return { ok: true, restored: true, integrity_verified: true }; },
    restoreBackupBytes: async () => { calls.push('backup'); return { ok: true, restored: true, integrity_verified: true }; },
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

test('opening a private kit does not count as a full disaster recovery', async () => {
  let opened = false;
  const actions = bindCountermeasureActions({
    repository: repository(),
    openPrivateCopy: async () => { opened = true; return { ok: true }; },
  });
  const result = await applyLifeCountermeasure('MIGRATION_SOURCE_DIED', actions);
  assert.equal(result.applied, false);
  assert.equal(result.activation_performed, false);
  assert.equal(result.reason, 'FULL_REBUILD_EXECUTOR_REQUIRED');
  assert.equal(opened, false);
});
test('even a claimed full rebuild without an integrity proof fails closed', async () => {
  const actions = bindCountermeasureActions({
    repository: repository(),
    rebuildFromPrivateKit: async () => ({ ok: true, restored: true }),
  });
  const result = await applyLifeCountermeasure('MIGRATION_SOURCE_DIED', actions);
  assert.equal(result.applied, false);
  assert.equal(result.reason, 'FULL_REBUILD_NOT_VERIFIED');
});

test('private-kit full rebuild never runs without explicit owner approval', async () => {
  let invocations = 0;
  const options = {
    repository: repository(),
    rebuildFromPrivateKit: async () => {
      invocations++;
      return { ok: true, restored: true, integrity_verified: true };
    },
  };
  const blocked = await applyLifeCountermeasure('MIGRATION_SOURCE_DIED', bindCountermeasureActions(options));
  assert.equal(blocked.applied, false);
  assert.equal(blocked.activation_performed, false);
  assert.equal(blocked.reason, 'OWNER_APPROVAL_REQUIRED');
  assert.equal(invocations, 0);
  const permitted = await applyLifeCountermeasure('MIGRATION_SOURCE_DIED', bindCountermeasureActions({
    ...options, ownerApprovedRecovery: true,
  }));
  assert.equal(permitted.applied, true);
  assert.equal(permitted.activation_performed, true);
  assert.equal(invocations, 1);
});

test('scheduler invocation without an admitted job is not a successful repair', async () => {
  const actions = bindCountermeasureActions({
    repository: repository(),
    supervisor: { ensureNextJob: async () => ({
      created: false, job: null, complete: false,
      external_progress: { status: 'AUTONOMY_SINGLE_FLIGHT_BUSY' },
    }) },
  });
  const result = await applyLifeCountermeasure('EVOLUTION_IDLE', actions);
  assert.equal(result.applied, false);
  assert.equal(result.activation_performed, false);
  assert.equal(result.reason, 'AUTONOMY_SINGLE_FLIGHT_BUSY');
});

test('a cancelled mission cannot report a new persisted countermeasure note', async () => {
  const store = repository();
  store.update = async () => ({ ...store.jobs[0], status: 'CANCELLED' });
  const result = await bindCountermeasureActions({ repository: store }).note('DO_NOT_DEPLOY');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'COUNTERMEASURE_AUDIT_NOT_PERSISTED');
});

test('MAX restoration cannot be marked successful without an active-state observation', async () => {
  const actions = bindCountermeasureActions({
    repository: repository(),
    setMax: async () => ({ ok: true, max_active: false }),
    keepMax: async () => ({ ok: false, code: 'PAUSED_BY_OWNER' }),
  });
  const restored = await applyLifeCountermeasure('MAX_PAUSED_BY_MISTAKE', actions);
  assert.equal(restored.applied, false);
  assert.equal(restored.reason, 'MAX_REACTIVATION_NOT_PROVEN');
  const kept = await applyLifeCountermeasure('OWNER_ABSENT', actions);
  assert.equal(kept.applied, false);
  assert.equal(kept.reason, 'PAUSED_BY_OWNER');
});
test('backup restoration requires proof of both completed restore and integrity', async () => {
  const actions = bindCountermeasureActions({
    repository: repository(),
    restoreBackupBytes: async () => ({ ok: true, restored: true, integrity_verified: false }),
  });
  const result = await applyLifeCountermeasure('MEMORY_CORRUPT', actions);
  assert.equal(result.applied, false);
  assert.equal(result.activation_performed, false);
  assert.equal(result.reason, 'BACKUP_RESTORE_NOT_VERIFIED');
});

test('contingency audit is scoped to the observed mission even with multiple active rows', async () => {
  const store = repository();
  store.jobs.push({ id: 'job-2', status: 'QUEUED', result_json: {}, updated_at: 2 });
  const scoped = bindCountermeasureActions({ repository: store, jobId: 'job-2' });
  const recorded = await scoped.note('DO_NOT_DEPLOY');
  assert.equal(recorded.ok, true);
  assert.equal(store.jobs[0].result_json.countermeasure, undefined);
  assert.equal(store.jobs[1].result_json.countermeasure.code, 'DO_NOT_DEPLOY');

  const wrong = await bindCountermeasureActions({ repository: store, jobId: 'job-missing' }).note('DO_NOT_MERGE');
  assert.equal(wrong.ok, false);
  assert.equal(store.jobs.every(job => job.result_json.countermeasure?.code !== 'DO_NOT_MERGE'), true);
  const ambiguous = await bindCountermeasureActions({ repository: store }).note('DO_NOT_MERGE');
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.code, 'AMBIGUOUS_ACTIVE_JOBS');
});

test('successful external rollback is not certified if its mission audit cannot persist', async () => {
  let rolledBack = false;
  const store = repository();
  store.jobs.length = 0;
  const actions = bindCountermeasureActions({
    repository: store,
    previousVersionId: 'v-before',
    rollbackWorker: async () => { rolledBack = true; return { ok: true }; },
  });
  const result = await actions.rollback();
  assert.equal(rolledBack, true);
  assert.equal(result.ok, false);
  assert.equal(result.rollback_performed, true);
  assert.equal(result.code, 'NO_ACTIVE_JOB');
});

test('MAX activation proof rejects paused, disabled and owner-stopped controls', () => {
  assert.deepEqual(maxControlProof({max_autonomy:true,paused:false}), {ok:true,max_active:true,active:true});
  for (const control of [null, {}, {max_autonomy:false,paused:false},
    {max_autonomy:true,paused:true,source:'owner-ui',reason:'owner-stop'}]) {
    const proof = maxControlProof(control);
    assert.equal(proof.ok,false);
    assert.equal(proof.max_active,false);
    assert.equal(proof.code,'MAX_CONTROL_NOT_ACTIVE');
  }
  const configured = bindCountermeasureActions({
    repository: repository(),
    setMax: async () => maxControlProof({max_autonomy:true,paused:false}),
    keepMax: async () => maxControlProof({max_autonomy:true,paused:true}),
  });
  assert.equal((configured.restoreMax && typeof configured.restoreMax), 'function');
});

test('countermeasure requeues a stale exhausted Teacher approval only with deployed SHA evidence', async () => {
  const oldSha = 'a'.repeat(40);
  const newSha = 'b'.repeat(40);
  const store = repository();
  const job = store.jobs[0];
  job.status = 'TEACHER_APPROVED';
  job.plan_json = {};
  job.result_json = {
    teacher_bridge: {
      status: 'ANSWERED',
      request: { request_id: 'stale-teacher-request', target_sha: oldSha },
      review: { verdict: 'APPROVE_PLAN', development_allowed: true },
    },
    autonomy_deferral: { exhausted: true },
  };
  const noSha = await bindCountermeasureActions({ repository: store, jobId: job.id }).requeue();
  assert.equal(noSha.ok, false);
  assert.equal(noSha.code, 'NO_RECOVERABLE_JOB');
  assert.equal(job.status, 'TEACHER_APPROVED');

  const sameSha = await bindCountermeasureActions({ repository: store, jobId: job.id, canonicalSha: oldSha }).requeue();
  assert.equal(sameSha.ok, false);
  assert.equal(job.status, 'TEACHER_APPROVED');

  const recovered = await bindCountermeasureActions({ repository: store, jobId: job.id, canonicalSha: newSha }).requeue();
  assert.equal(recovered.ok, true);
  assert.equal(recovered.recovered, 1);
  assert.equal(job.status, 'QUEUED');
  assert.equal(job.result_json.teacher_bridge, null);
  assert.equal(job.result_json.last_teacher_stale.current_candidate_sha, newSha);
});

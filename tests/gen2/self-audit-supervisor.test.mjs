import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  MEL_SELF_AUDIT_CADENCE_MS,
  buildCapabilityHealthLedger,
  capabilityLedgerSummary,
  dueSelfAuditLevels,
  persistentStressFailures,
  runMelSelfAuditSupervisor,
} from '../../src/diagnostics/self-audit-supervisor.js';

class MemoryStateStore {
  constructor(state = null) {
    this.state = state || {
      schema: 'mel.self-audit-supervisor/v1',
      last_runs: { HEARTBEAT: 0, DAILY: 0, WEEKLY: 0, MONTHLY: 0 },
      failure_streaks: {},
      repair_fingerprints: [],
      last_report: null,
      updated_at: 0,
    };
  }
  async load() { return structuredClone(this.state); }
  async save(value) { this.state = structuredClone(value); return this.state; }
}

function baseDeps(overrides = {}) {
  return {
    getAutonomyControl: async () => ({ max_autonomy: false, paused: false }),
    readLatestStress: async () => null,
    runLoraTrainingHeartbeat: async () => ({ ok: true, status: 'TRAINING_CHAIN_ACTIVE' }),
    runEcosystemCapabilityWatch: async () => ({ ok: true, status: 'RAN' }),
    runDependencyLongevityWatchRuntime: async () => ({ ok: true, status: 'WATCHED' }),
    runSovereigntyReplacementWatchRuntime: async () => ({ ok: true, status: 'WATCHED' }),
    runConfiguredAiCandidateValidationRuntime: async () => ({ ok: true, status: 'AI_SOVEREIGNTY_NOOP', prevalidated: 0, blocked: 0 }),
    runCompanionSourceControlPrevalidationRuntime: async () => ({ ok: true, skipped: false, status: 'PREVALIDATED', prevalidated: 1, blocked: 0 }),
    runCompanionInfrastructurePrevalidationRuntime: async () => ({ ok: true, skipped: false, status: 'PREVALIDATED_ALL', prevalidated: 8, blocked: 0 }),
    runScheduledSystemBackup: async () => ({ ok: true, status: 'CREATED_VERIFIED', id: 'system-proof' }),
    enqueueDevelopment: async () => ({ job_id: 'repair-job', status: 'WAITING_TEACHER' }),
    ...overrides,
  };
}

function fakeBus(overrides = {}) {
  const calls = [];
  const rows = [
    { id: 'echo', health: 'HEALTHY', enabled: true },
    { id: 'system.integrity', health: 'HEALTHY', enabled: true },
    { id: 'system.maturity', health: 'HEALTHY', enabled: true },
    { id: 'capability.audit', health: 'HEALTHY', enabled: true },
    { id: 'model.council', health: 'HEALTHY', enabled: true },
  ];
  return {
    calls,
    list: () => rows.map(row => ({ ...row })),
    refreshHealthAll: async () => rows.map(row => ({ ...row })),
    execute: async (id, input) => {
      calls.push({ id, input });
      if (id === 'system.integrity') return { ok: true };
      if (id === 'system.maturity') return { ok: true };
      if (id === 'capability.audit') return { job_id: 'cap-stress-weekly', status: 'RUNNING' };
      if (id === 'resilience.recovery.drill.latest') return {
        ok:true,
        state:'PASSED',
        production_access_used:false,
        activation_performed:false,
        teardown_completed:true,
      };
      if (id === 'model.council') return {
        status: 'COMPLETE',
        independent_response_count: 2,
        unique_model_count: 2,
        synthesis: { status: 'COMPLETE' },
      };
      throw new Error('UNEXPECTED_CAPABILITY:' + id);
    },
    ...overrides,
  };
}

test('self-audit cadence escalates from hourly to daily, weekly and monthly', () => {
  const now = Date.UTC(2026, 9, 1, 12, 0, 0);
  const state = {
    last_runs: {
      HEARTBEAT: now - MEL_SELF_AUDIT_CADENCE_MS.HEARTBEAT - 1,
      DAILY: now - MEL_SELF_AUDIT_CADENCE_MS.DAILY - 1,
      WEEKLY: now - MEL_SELF_AUDIT_CADENCE_MS.WEEKLY - 1,
      MONTHLY: now - MEL_SELF_AUDIT_CADENCE_MS.MONTHLY - 1,
    },
  };
  assert.deepEqual(dueSelfAuditLevels(state, now), ['HEARTBEAT','DAILY','WEEKLY','MONTHLY']);
  assert.deepEqual(dueSelfAuditLevels(state, now, { maxLevel: 'HEARTBEAT' }), ['HEARTBEAT']);
  assert.deepEqual(dueSelfAuditLevels(state, now, { maxLevel: 'WEEKLY', forceLevel: 'WEEKLY' }), ['HEARTBEAT','DAILY','WEEKLY']);
});


test('capability health ledger persists provider, tests, failure evidence, latency and next check', () => {
  const now = Date.UTC(2026, 9, 8, 12, 0, 0);
  const stressAt = now - 60_000;
  const ledger = buildCapabilityHealthLedger({}, [
    { id:'healthy.cap', name:'Healthy', category:'test', provider:'core', risk:'LOW', enabled:true, health:'HEALTHY' },
    { id:'broken.cap', name:'Broken', category:'test', provider:'external', risk:'LOW', enabled:true, health:'DEGRADED' },
  ], {
    job_id:'cap-stress-ledger',
    completed_at:stressAt,
    report:{
      capabilities:[
        {
          id:'healthy.cap', tested_now:true, truth_status:'EXISTANT_ET_TESTE',
          contract_valid:true, auto_execution_blocked:null,
          execution:{ok:true,duration_ms:17},
        },
        {
          id:'broken.cap', tested_now:true, truth_status:'EXISTANT_MAIS_ECHEC_RUNTIME',
          contract_valid:true, auto_execution_blocked:null,
          execution:{ok:false,code:'BROKEN_RUNTIME',duration_ms:29},
        },
      ],
    },
  }, { now, heartbeatMs:3_600_000, weeklyMs:604_800_000 });

  assert.equal(ledger['healthy.cap'].provider, 'core');
  assert.equal(ledger['healthy.cap'].last_test_success_at, stressAt);
  assert.equal(ledger['healthy.cap'].latency_ms, 17);
  assert.equal(ledger['healthy.cap'].next_check_at, now + 3_600_000);
  assert.equal(ledger['healthy.cap'].stale_test, false);
  assert.equal(ledger['broken.cap'].last_test_failure_at, stressAt);
  assert.equal(ledger['broken.cap'].last_error, 'BROKEN_RUNTIME');
  assert.equal(ledger['broken.cap'].latency_ms, 29);

  assert.deepEqual(capabilityLedgerSummary(ledger), {
    total:2,
    healthy:1,
    degraded:1,
    unavailable:0,
    stale_tests:0,
    last_test_failures:1,
  });
});

test('persistent stress failures expose only real runtime failures', () => {
  assert.deepEqual(persistentStressFailures({
    report: {
      capabilities: [
        { id: 'ok', truth_status: 'EXISTANT_OPERATIONNEL', execution: { ok: true } },
        { id: 'broken', truth_status: 'EXISTANT_MAIS_ECHEC_RUNTIME', execution: { ok: false, code: 'BROKEN' }, risk: 'LOW' },
      ],
    },
  }), [{ id: 'broken', code: 'BROKEN', risk: 'LOW' }]);
});

test('hourly heartbeat is lightweight and persistent', async () => {
  const store = new MemoryStateStore();
  const bus = fakeBus();
  const now = Date.UTC(2026, 9, 1, 12, 0, 0);
  const result = await runMelSelfAuditSupervisor({}, {
    bus,
    stateStore: store,
    maxLevel: 'HEARTBEAT',
    forceLevel: 'HEARTBEAT',
    now,
    deps: baseDeps(),
  });

  assert.equal(result.status, 'SELF_AUDIT_OK');
  assert.deepEqual(result.report.levels, ['HEARTBEAT']);
  assert.equal(result.report.task_count, 1);
  assert.equal(result.report.policy.hourly_lightweight_heartbeat, true);
  assert.equal(store.state.last_runs.HEARTBEAT, now);
  assert.equal(bus.calls.length, 0);
});

test('weekly audit refreshes daily controls and starts durable full stress', async () => {
  const store = new MemoryStateStore();
  const bus = fakeBus();
  const result = await runMelSelfAuditSupervisor({}, {
    bus,
    stateStore: store,
    maxLevel: 'WEEKLY',
    forceLevel: 'WEEKLY',
    now: Date.UTC(2026, 9, 1, 12, 0, 0),
    deps: baseDeps(),
  });

  assert.equal(result.report.policy.weekly_full_capability_stress, true);
  assert.equal(result.report.started_stress.job_id, 'cap-stress-weekly');
  assert.ok(bus.calls.some(row => row.id === 'system.integrity'));
  assert.ok(bus.calls.some(row => row.id === 'system.maturity'));
  assert.ok(bus.calls.some(row => row.id === 'capability.audit' && row.input.deep === true));
});

test('two consecutive anomalies trigger Council and one idempotent MAX repair handoff', async () => {
  const store = new MemoryStateStore({
    schema: 'mel.self-audit-supervisor/v1',
    last_runs: { HEARTBEAT: 0, DAILY: 0, WEEKLY: Date.now(), MONTHLY: Date.now() },
    failure_streaks: { 'lora-heartbeat': 1 },
    repair_fingerprints: [],
    last_report: null,
    updated_at: 0,
  });
  const bus = fakeBus();
  let queued = 0;
  const deps = baseDeps({
    getAutonomyControl: async () => ({ max_autonomy: true, paused: false }),
    runLoraTrainingHeartbeat: async () => ({ ok: false, status: 'HEARTBEAT_ERROR', error: 'TRAINING_CHAIN_DOWN' }),
    enqueueDevelopment: async input => {
      queued += 1;
      assert.equal(input.requestedBy, 'mel-autonomy');
      assert.equal(input.source, 'self-audit-supervisor');
      return { job_id: 'repair-job', status: 'WAITING_TEACHER' };
    },
  });

  const first = await runMelSelfAuditSupervisor({}, {
    bus,
    stateStore: store,
    maxLevel: 'DAILY',
    forceLevel: 'DAILY',
    now: Date.UTC(2026, 9, 2, 12, 0, 0),
    deps,
  });
  assert.equal(first.report.council.ok, true);
  assert.equal(first.report.repair.queued, true);
  assert.equal(queued, 1);

  const second = await runMelSelfAuditSupervisor({}, {
    bus,
    stateStore: store,
    maxLevel: 'DAILY',
    forceLevel: 'DAILY',
    now: Date.UTC(2026, 9, 2, 13, 0, 0),
    deps,
  });
  assert.equal(queued, 1);
  assert.equal(second.report.repair, null);
});


test('a previous runtime stress failure keeps the supervisor degraded until disproven', async () => {
  const store = new MemoryStateStore();
  const result = await runMelSelfAuditSupervisor({}, {
    bus: fakeBus(),
    stateStore: store,
    maxLevel: 'HEARTBEAT',
    forceLevel: 'HEARTBEAT',
    now: Date.UTC(2026, 9, 8, 12, 0, 0),
    deps: baseDeps({
      readLatestStress: async () => ({
        job_id:'cap-stress-broken',
        completed_at:Date.UTC(2026, 9, 8, 11, 0, 0),
        report:{
          capabilities:[{
            id:'broken.cap',
            truth_status:'EXISTANT_MAIS_ECHEC_RUNTIME',
            risk:'LOW',
            tested_now:true,
            execution:{ok:false,code:'BROKEN_RUNTIME',duration_ms:11},
          }],
        },
      }),
    }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'SELF_AUDIT_DEGRADED');
  assert.equal(result.report.previous_stress.failure_count, 1);
  assert.ok(result.report.unresolved_failure_count >= 1);
});

test('monthly survival audit flags an offline companion instead of inventing a passed alternative drill', async () => {
  const store = new MemoryStateStore();
  const result = await runMelSelfAuditSupervisor({}, {
    bus: fakeBus(),
    stateStore: store,
    maxLevel: 'MONTHLY',
    forceLevel: 'MONTHLY',
    now: Date.UTC(2026, 9, 8, 12, 0, 0),
    deps: baseDeps({
      runCompanionSourceControlPrevalidationRuntime: async () => ({ ok:true, skipped:true, reason:'COMPANION_OFFLINE' }),
      runCompanionInfrastructurePrevalidationRuntime: async () => ({ ok:true, skipped:true, reason:'COMPANION_OFFLINE' }),
    }),
  });
  assert.equal(result.status, 'SELF_AUDIT_DEGRADED');
  assert.equal(result.report.tasks['source-control-alternative-drill'].ok, false);
  assert.equal(result.report.tasks['infrastructure-alternative-drill'].ok, false);
});

test('monthly drill creates verified backup without destructive restore policy', async () => {
  const store = new MemoryStateStore();
  let backups = 0;
  const result = await runMelSelfAuditSupervisor({}, {
    bus: fakeBus(),
    stateStore: store,
    maxLevel: 'MONTHLY',
    forceLevel: 'MONTHLY',
    now: Date.UTC(2026, 9, 1, 12, 0, 0),
    deps: baseDeps({
      runScheduledSystemBackup: async options => {
        backups += 1;
        assert.equal(options.force, true);
        assert.equal(options.compactPostPersistVerify, true);
        return { ok: true, status: 'CREATED_VERIFIED', id: 'system-monthly' };
      },
    }),
  });
  assert.equal(backups, 1);
  assert.equal(result.report.policy.monthly_non_destructive_survival_drill, true);
  assert.equal(result.report.policy.destructive_production_restore, false);
  const recovery = result.report.tasks['monthly-isolated-recovery-drill'];
  assert.equal(recovery.ok, true);
  assert.equal(recovery.status, 'RECOVERY_DRILL_PASSED');
  assert.ok(result.report.capability_health.total > 0);
});

test('Worker scheduler routes 02:43 daily cron to the self-audit supervisor and keeps hourly heartbeat', () => {
  const source = fs.readFileSync('src/index.js', 'utf8');
  const wrangler = fs.readFileSync('wrangler.jsonc', 'utf8');
  assert.match(wrangler, /"43 2 \* \* \*"/);
  assert.match(source, /dailySelfAuditCron = cron === '43 2 \* \* \*'/);
  assert.match(source, /runSelfAudit\('MONTHLY'\)/);
  assert.match(source, /runSelfAudit\('HEARTBEAT'\)/);
  assert.match(source, /runLoraTrainingHeartbeat/);
});

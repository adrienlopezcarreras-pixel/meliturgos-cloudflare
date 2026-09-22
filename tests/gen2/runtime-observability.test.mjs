import test from 'node:test';
import assert from 'node:assert/strict';
import { createGen2Runtime } from '../../src/core/orchestrator/gen2-runtime.js';
import { readRuntimeObservability } from '../../src/diagnostics/runtime-observability.js';
import { buildHealthDashboard } from '../../src/diagnostics/health-dashboard.js';

class FakeDb {
  constructor(rows = []) {
    this.rows = [...rows];
  }

  prepare(sql) {
    const db = this;
    return {
      params: [],
      bind(...params) {
        this.params = params;
        return this;
      },
      async run() {
        if (/INSERT\s+INTO\s+audit_logs/i.test(sql)) {
          db.rows.push({
            timestamp: this.params[0],
            action: this.params[1],
            path: this.params[2],
            details_json: this.params[3],
          });
        }
        return { success: true };
      },
      async all() {
        if (/FROM\s+audit_logs/i.test(sql)) {
          const since = Number(this.params[0]) || 0;
          const limit = Number(this.params[1]) || 200;
          return {
            results: db.rows
              .filter(row => Number(row.timestamp) >= since)
              .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
              .slice(0, limit),
          };
        }
        return { results: [] };
      },
      async first() { return null; },
    };
  }
}

function row(timestamp, status, extra = {}) {
  return {
    timestamp,
    action: 'capability_bus',
    details_json: JSON.stringify({ status, ...extra }),
  };
}

test('GEN2-44 persists bounded CapabilityBus lifecycle events to D1 by default', async () => {
  const db = new FakeDb();
  const runtime = createGen2Runtime({ env: { DB: db } });
  const result = await runtime.bus.execute('echo', { value: 'observed' }, {
    owner: 'owner',
    permissions: [],
    requestId: 'obs-1',
  });

  assert.equal(result.value, 'observed');
  assert.equal(db.rows.length, 1);
  const details = db.rows.map(entry => JSON.parse(entry.details_json));
  assert.deepEqual(details.map(entry => entry.status), ['SUCCEEDED']);
  assert.equal(details[0].capability, 'echo');
  assert.equal(details[0].request_id, 'obs-1');
  assert.equal(details[0].owner, undefined);
  assert.ok(Number.isFinite(details[0].duration_ms));
});

test('GEN2-44 aggregates recent runtime failures and latency without returning raw details', async () => {
  const now = Date.parse('2026-09-22T08:00:00.000Z');
  const db = new FakeDb([
    row(now - 1000, 'STARTED', { capability:'a', token:'must-not-leak' }),
    row(now - 900, 'FAILED', { capability:'a', duration_ms:7000, error_code:'X', token:'must-not-leak' }),
    row(now - 800, 'STARTED', { capability:'b' }),
    row(now - 700, 'FAILED', { capability:'b', duration_ms:6000 }),
    row(now - 600, 'STARTED', { capability:'c' }),
    row(now - 500, 'SUCCEEDED', { capability:'c', duration_ms:100 }),
    row(now - 400, 'STARTED', { capability:'d' }),
    row(now - 300, 'SUCCEEDED', { capability:'d', duration_ms:120 }),
    row(now - 200, 'DENIED', { capability:'danger', reason:'EXPLICIT_APPROVAL_REQUIRED' }),
  ]);

  const observed = await readRuntimeObservability({ db, now, windowMs:60_000, limit:100 });
  assert.equal(observed.query_ok, true);
  assert.equal(observed.status, 'ERROR');
  assert.equal(observed.metrics.completed, 4);
  assert.equal(observed.metrics.failed, 2);
  assert.equal(observed.metrics.failure_rate, 0.5);
  assert.equal(observed.metrics.denied, 1);
  assert.equal(observed.metrics.p95_duration_ms, 7000);
  assert.equal(JSON.stringify(observed).includes('must-not-leak'), false);

  const dashboard = buildHealthDashboard({
    readiness:{state:'READY',percent:100,critical_ready:1,critical_total:1},
    bindings:{ai:true,db:true,media_bucket:true,owner:true,github_repository:true,github_branch:'main'},
    selfCode:{branch_known:true,commit_known:true,exact_identity_known:true},
    critical:{runtime:true},
    capabilities:{total:1,health:{HEALTHY:1}},
    models:{configured:2,explicit_zero_cost:2,runtime_zero_cost:{status:'ONLINE',minimum:2,authorized_zero_cost_count:2}},
    blockers:[],
    observability:observed,
    now:new Date(now),
  });
  assert.equal(dashboard.state, 'ERROR');
  assert.ok(dashboard.alerts.some(alert => alert.code === 'RUNTIME_CAPABILITY_FAILURE_RATE'));
  assert.ok(dashboard.alerts.some(alert => alert.code === 'RUNTIME_CAPABILITY_LATENCY_HIGH'));
  assert.ok(dashboard.alerts.some(alert => alert.code === 'RUNTIME_CAPABILITY_DENIALS'));
  const component = dashboard.components.find(entry => entry.id === 'runtime_observability');
  assert.equal(component.evidence.failed, 2);
  assert.equal(JSON.stringify(component).includes('must-not-leak'), false);
});

test('GEN2-44 remains fail-soft and explicit when audit metrics cannot be queried', async () => {
  const db = { prepare() { throw new Error('db unavailable'); } };
  const observed = await readRuntimeObservability({ db, now:0 });
  assert.equal(observed.query_ok, false);
  assert.equal(observed.status, 'UNAVAILABLE');
  assert.equal(observed.reason, 'AUDIT_QUERY_FAILED');
  assert.equal(observed.metrics.capability_events, 0);
});

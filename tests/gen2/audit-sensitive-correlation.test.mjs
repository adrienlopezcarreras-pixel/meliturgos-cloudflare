import test from 'node:test';
import assert from 'node:assert/strict';

import { CapabilityBus } from '../../src/capabilities/capability-bus.js';
import { createGen2Runtime } from '../../src/core/orchestrator/gen2-runtime.js';

class FakeDb {
  constructor() { this.rows = []; }
  prepare(sql) {
    const db = this;
    return {
      params: [],
      bind(...params) { this.params = params; return this; },
      async run() {
        if (/INSERT\s+INTO\s+audit_logs/i.test(sql)) {
          db.rows.push({
            timestamp: this.params[0],
            action: this.params[1],
            path: this.params[2],
            details_json: this.params[3],
          });
        }
        return { success:true };
      },
      async all() { return { results:[] }; },
      async first() { return null; },
    };
  }
}

function sensitiveFixture(bus, { fail = false } = {}) {
  bus.discover({
    id:'fixture.sensitive',
    name:'Sensitive audit fixture',
    category:'test',
    version:'1.0.0',
    provider:'test',
    description:'HIGH-risk fixture used only to prove central audit correlation.',
    input_schema:{
      type:'object',
      properties:{ value:{ type:'string', minLength:1, maxLength:100 } },
      required:['value'],
      additionalProperties:false,
    },
    output_schema:{
      type:'object',
      properties:{ ok:{ type:'boolean' } },
      required:['ok'],
      additionalProperties:false,
    },
    risk:'HIGH',
    permissions:['fixture.sensitive'],
    approval:{ required:true, scope:'fixture.sensitive', reason:'TEST_SENSITIVE_ACTION' },
    health:'HEALTHY',
    enabled:true,
  }, async () => {
    if (fail) throw Object.assign(new Error('FIXTURE_SENSITIVE_FAILURE'), { code:'FIXTURE_SENSITIVE_FAILURE' });
    return { ok:true };
  });
}

function details(db) {
  return db.rows
    .filter(row => row.action === 'capability_bus')
    .map(row => JSON.parse(row.details_json));
}

test('GEN2-45 persists correlated DENIED audit rows for auth, permission and approval failures', async () => {
  const db = new FakeDb();
  const runtime = createGen2Runtime({ env:{ DB:db } });
  sensitiveFixture(runtime.bus);

  await assert.rejects(
    () => runtime.bus.execute('fixture.sensitive', { value:'auth' }, {
      permissions:['fixture.sensitive'],
      requestId:'audit-auth-denied',
    }),
    error => error?.code === 'AUTH_REQUIRED' || error?.message === 'AUTH_REQUIRED',
  );

  await assert.rejects(
    () => runtime.bus.execute('fixture.sensitive', { value:'permission' }, {
      owner:'owner',
      permissions:[],
      requestId:'audit-permission-denied',
    }),
    error => error?.code === 'PERMISSION_DENIED' || error?.message === 'PERMISSION_DENIED',
  );

  await assert.rejects(
    () => runtime.bus.execute('fixture.sensitive', { value:'approval' }, {
      owner:'owner',
      permissions:['fixture.sensitive'],
      requestId:'audit-approval-denied',
    }),
    error => error?.code === 'EXPLICIT_APPROVAL_REQUIRED',
  );

  const rows = details(db);
  assert.deepEqual(rows.map(row => row.status), ['DENIED','DENIED','DENIED']);
  assert.deepEqual(rows.map(row => row.request_id), [
    'audit-auth-denied',
    'audit-permission-denied',
    'audit-approval-denied',
  ]);
  assert.deepEqual(rows.map(row => row.capability), [
    'fixture.sensitive',
    'fixture.sensitive',
    'fixture.sensitive',
  ]);
  assert.deepEqual(rows.map(row => row.reason), [
    'AUTH_REQUIRED',
    'PERMISSION_DENIED',
    'EXPLICIT_APPROVAL_REQUIRED',
  ]);
  assert.equal(JSON.stringify(rows).includes('"value"'), false);
  assert.equal(JSON.stringify(rows).includes('auth'), true); // request id only
});

test('GEN2-45 persists correlated terminal audit rows for approved success and handler failure', async () => {
  const db = new FakeDb();
  const runtime = createGen2Runtime({ env:{ DB:db } });
  sensitiveFixture(runtime.bus);

  const ok = await runtime.bus.execute('fixture.sensitive', { value:'approved-secret-input' }, {
    owner:'owner',
    permissions:['fixture.sensitive'],
    approvedCapabilities:['fixture.sensitive'],
    requestId:'audit-sensitive-success',
  });
  assert.deepEqual(ok, { ok:true });

  const failingBus = new CapabilityBus({
    audit: async event => {
      const status = String(event?.status || '').toUpperCase();
      if (!['SUCCEEDED','FAILED','DENIED'].includes(status)) return;
      db.rows.push({
        action:'capability_bus',
        details_json:JSON.stringify({
          capability:event.capability,
          status,
          request_id:event.requestId,
          reason:event.reason || null,
          error_code:event.error_code || null,
          duration_ms:event.duration_ms ?? null,
        }),
      });
    },
  });
  sensitiveFixture(failingBus, { fail:true });

  await assert.rejects(
    () => failingBus.execute('fixture.sensitive', { value:'failed-secret-input' }, {
      owner:'owner',
      permissions:['fixture.sensitive'],
      approvedCapabilities:['fixture.sensitive'],
      requestId:'audit-sensitive-failed',
    }),
    error => error?.code === 'FIXTURE_SENSITIVE_FAILURE',
  );

  const rows = details(db);
  const success = rows.find(row => row.request_id === 'audit-sensitive-success');
  const failed = rows.find(row => row.request_id === 'audit-sensitive-failed');
  assert.equal(success?.status, 'SUCCEEDED');
  assert.ok(Number.isFinite(success?.duration_ms));
  assert.equal(failed?.status, 'FAILED');
  assert.equal(failed?.error_code, 'FIXTURE_SENSITIVE_FAILURE');
  assert.ok(Number.isFinite(failed?.duration_ms));
  const serialized = JSON.stringify(rows);
  assert.equal(serialized.includes('approved-secret-input'), false);
  assert.equal(serialized.includes('failed-secret-input'), false);
});

test('GEN2-45 every registered HIGH capability is structurally behind the same central audit bus', () => {
  const runtime = createGen2Runtime({ env:{} });
  const high = runtime.bus.list().filter(row => String(row.risk).toUpperCase() === 'HIGH');
  assert.ok(high.length >= 1, 'expected at least one HIGH-risk capability');
  for (const row of high) {
    const contract = runtime.bus.contract(row.id);
    assert.equal(contract.authorization_gate, true, row.id);
    assert.equal(contract.input_validation_gate, true, row.id);
    assert.equal(contract.output_validation_gate, true, row.id);
  }
});

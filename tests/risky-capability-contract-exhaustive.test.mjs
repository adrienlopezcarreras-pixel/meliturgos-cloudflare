import test from 'node:test';
import assert from 'node:assert/strict';

import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';

test('every MEDIUM/HIGH runtime capability has a valid guarded contract', () => {
  const runtime = createGen2Runtime({ env:{} });
  const risky = runtime.bus.list().filter(row => row.risk === 'MEDIUM' || row.risk === 'HIGH');
  assert.ok(risky.length > 20, 'risky capability inventory unexpectedly shrank');

  const invalid = [];
  for (const row of risky) {
    const contract = runtime.bus.contract(row.id);
    if (
      contract?.valid !== true
      || contract?.handler_registered !== true
      || contract?.input_schema_valid !== true
      || contract?.output_schema_valid !== true
      || contract?.authorization_gate !== true
      || contract?.input_validation_gate !== true
      || contract?.output_validation_gate !== true
    ) {
      invalid.push({ id:row.id, contract });
    }
  }
  assert.deepEqual(invalid,[]);
});

test('every explicitly approval-gated mutation advertises the gate in its contract', () => {
  const runtime = createGen2Runtime({ env:{} });
  const records = runtime.bus.list();
  const guarded = records
    .map(row => ({ row, contract:runtime.bus.contract(row.id) }))
    .filter(({ contract }) => contract?.explicit_approval_gate === true);

  assert.ok(guarded.length >= 10, 'explicit approval-gated mutation inventory unexpectedly shrank');
  for (const { row, contract } of guarded) {
    assert.ok(row.risk === 'MEDIUM' || row.risk === 'HIGH', 'approval-gated capability must not be LOW risk: '+row.id);
    assert.equal(contract.approval_policy_valid,true,row.id);
    assert.equal(contract.authorization_gate,true,row.id);
    assert.equal(contract.valid,true,row.id);
  }
});

test('no MEDIUM/HIGH capability is part of the automatic LOW-risk stress execution set', async () => {
  const runtime = createGen2Runtime({ env:{} });
  const riskyIds = new Set(runtime.bus.list().filter(row => row.risk !== 'LOW').map(row => row.id));
  const { SAFE_SAMPLES } = await import('../src/diagnostics/capability-truth-audit.js');

  // SAFE_SAMPLES may contain a shape for documentation/testing purposes, but
  // the runtime stress gate must still classify the capability as RISK_NOT_LOW.
  const { auditRuntimeCapabilities } = await import('../src/diagnostics/capability-truth-audit.js');
  const report = await auditRuntimeCapabilities(runtime,{ deep:true, samples:SAFE_SAMPLES });
  for (const row of report.capabilities) {
    if (!riskyIds.has(row.id)) continue;
    assert.equal(row.tested_now,false,'automatic stress executed a risky capability: '+row.id);
    assert.equal(row.auto_execution_blocked,'RISK_NOT_LOW',row.id);
  }
});

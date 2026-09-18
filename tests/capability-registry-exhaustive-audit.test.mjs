import test from 'node:test';
import assert from 'node:assert/strict';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';
import { auditRuntimeCapabilities } from '../src/diagnostics/capability-truth-audit.js';

function context() {
  return { owner: 'audit-owner', permissions: [], requestId: crypto.randomUUID() };
}

test('every registered runtime capability is unique, inventoried and truth-classified', async () => {
  const runtime = createGen2Runtime({ env: {} });
  const records = runtime.bus.list();
  const ids = records.map(row => row.id);
  assert.equal(new Set(ids).size, ids.length, 'capability ids must be unique');
  assert.ok(ids.length >= 25, 'runtime capability inventory unexpectedly shrank');

  const report = await auditRuntimeCapabilities(runtime, { deep: false, context: context() });
  assert.equal(report.ok, true);
  assert.equal(report.total, records.length);
  assert.deepEqual(new Set(report.capabilities.map(row => row.id)), new Set(ids));

  for (const row of report.capabilities) {
    assert.ok(row.truth_status, 'missing truth status for ' + row.id);
    assert.ok(['LOW','MEDIUM','HIGH'].includes(row.risk), 'invalid risk for ' + row.id);
    assert.equal(typeof row.enabled, 'boolean', 'invalid enabled flag for ' + row.id);
    assert.ok(row.provider, 'missing provider for ' + row.id);
  }
});

test('deep capability audit executes every automatically-safe sample and none may fail silently', async () => {
  const runtime = createGen2Runtime({ env: {} });
  const report = await auditRuntimeCapabilities(runtime, { deep: true, context: context() });

  assert.equal(report.total, runtime.bus.list().length);
  const attempted = report.capabilities.filter(row => row.tested_now);
  assert.ok(attempted.length >= 5, 'deep audit should exercise several bounded LOW-risk capabilities');

  const failed = attempted.filter(row => row.execution?.ok !== true);
  assert.deepEqual(failed.map(row => ({ id: row.id, execution: row.execution })), []);

  for (const row of report.capabilities) {
    if (row.risk !== 'LOW') {
      assert.equal(row.tested_now, false, 'non-LOW capability auto-executed: ' + row.id);
      assert.equal(row.auto_execution_blocked, 'RISK_NOT_LOW', 'non-LOW capability missing risk gate: ' + row.id);
    } else if (!row.tested_now) {
      assert.ok(row.auto_execution_blocked, 'untested LOW capability must explain why: ' + row.id);
    }
  }
});

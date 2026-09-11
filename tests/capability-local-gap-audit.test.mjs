import test from 'node:test';
import assert from 'node:assert/strict';
import { auditRuntimeCapabilities, COST_SENSITIVE_CAPABILITIES } from '../src/diagnostics/capability-truth-audit.js';

test('local evolution.gap.detect deep smoke runs without zero-cost override', async () => {
  assert.equal(COST_SENSITIVE_CAPABILITIES.has('evolution.gap.detect'), false);
  let executions = 0;
  let healthProbes = 0;
  const record = {
    id: 'evolution.gap.detect',
    name: 'Détecteur local',
    category: 'evolution',
    provider: 'mel',
    risk: 'LOW',
    enabled: true,
    health: 'HEALTHY',
    implementation_status: 'IMPLEMENTED',
  };
  const bus = {
    list: () => [record],
    refreshHealth: async id => {
      assert.equal(id, 'evolution.gap.detect');
      healthProbes += 1;
      return record;
    },
    execute: async (id, input) => {
      assert.equal(id, 'evolution.gap.detect');
      assert.equal(typeof input.goal, 'string');
      executions += 1;
      return { ok: true, classification: 'POSSIBLE_GAP' };
    },
  };

  const result = await auditRuntimeCapabilities({ bus }, { deep: true });
  const row = result.capabilities[0];
  assert.equal(healthProbes, 1);
  assert.equal(executions, 1);
  assert.equal(row.auto_execution_blocked, null);
  assert.equal(row.tested_now, true);
  assert.equal(row.truth_status, 'EXISTANT_ET_TESTE');
});

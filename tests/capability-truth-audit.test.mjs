import test from 'node:test';
import assert from 'node:assert/strict';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';
import { auditRuntimeCapabilities, SAFE_SAMPLES } from '../src/diagnostics/capability-truth-audit.js';

test('truth audit inventories every registered runtime capability without omission', async () => {
  const runtime = createGen2Runtime({ env: {} });
  const registered = runtime.bus.list();
  const report = await auditRuntimeCapabilities(runtime, { deep: false });
  assert.equal(report.ok, true);
  assert.equal(report.total, registered.length);
  assert.ok(report.total >= 14, `expected at least 14 capabilities, got ${report.total}`);
  const ids = new Set(report.capabilities.map(row => row.id));
  for (const record of registered) assert.ok(ids.has(record.id), `missing ${record.id}`);
  for (const row of report.capabilities) {
    assert.ok(row.truth_status);
    assert.equal(row.tested_now, false);
    assert.ok(['LOW','MEDIUM','HIGH'].includes(row.risk), `unexpected risk for ${row.id}: ${row.risk}`);
  }
});

test('safe smoke catalogue covers core read-only capabilities used by normal chat', () => {
  for (const id of ['echo','roadmap.read','system.bindings','code.read','code.search','conversation.list','rag.search','chatgpt.archive.preview','autonomy.status']) {
    assert.ok(Object.hasOwn(SAFE_SAMPLES, id), `missing bounded smoke sample for ${id}`);
  }
});

test('deep audit executes bounded LOW-risk samples and reports failures instead of inventing success', async () => {
  const records = [
    { id:'ok', name:'OK', category:'test', provider:'test', risk:'LOW', enabled:true, health:'HEALTHY' },
    { id:'bad', name:'BAD', category:'test', provider:'test', risk:'LOW', enabled:true, health:'HEALTHY' },
    { id:'medium', name:'MEDIUM', category:'test', provider:'test', risk:'MEDIUM', enabled:true, health:'HEALTHY' },
  ];
  const fake = {
    bus: {
      refreshHealthAll: async () => records,
      list: () => records,
      execute: async (id) => {
        if (id === 'bad') throw Object.assign(new Error('EXPECTED_FAILURE'), { code:'EXPECTED_FAILURE' });
        return { ok:true };
      },
    },
  };
  const report = await auditRuntimeCapabilities(fake, {
    deep:true,
    samples:{ ok:{}, bad:{}, medium:{} },
  });
  assert.equal(report.total, 3);
  const ok = report.capabilities.find(x => x.id === 'ok');
  const bad = report.capabilities.find(x => x.id === 'bad');
  const medium = report.capabilities.find(x => x.id === 'medium');
  assert.equal(ok.tested_now, true);
  assert.equal(ok.truth_status, 'EXISTANT_ET_TESTE');
  assert.equal(bad.tested_now, true);
  assert.equal(bad.truth_status, 'EXISTANT_MAIS_ECHEC_RUNTIME');
  assert.equal(bad.execution.code, 'EXPECTED_FAILURE');
  assert.equal(medium.tested_now, false);
  assert.equal(medium.truth_status, 'EXISTANT_NON_TESTE');
});

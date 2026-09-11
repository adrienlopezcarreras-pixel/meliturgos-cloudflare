import test from 'node:test';
import assert from 'node:assert/strict';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';
import { auditRuntimeCapabilities, SAFE_SAMPLES, classifyCapabilityTruth } from '../src/diagnostics/capability-truth-audit.js';

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

test('safe smoke catalogue covers core read-only and preview-only capabilities', () => {
  for (const id of [
    'echo','roadmap.read','system.bindings','code.read','code.search','conversation.list','rag.search',
    'chatgpt.archive.preview','autonomy.status','mentor.recent','evolution.gap.detect','device.policy.preview','web.research'
  ]) {
    assert.ok(Object.hasOwn(SAFE_SAMPLES, id), `missing bounded smoke sample for ${id}`);
  }
});

test('shared truth classifier never promotes healthy registration to tested proof', () => {
  assert.equal(classifyCapabilityTruth({ enabled:true, health:'HEALTHY' }), 'EXISTANT_NON_TESTE');
  assert.equal(classifyCapabilityTruth({ enabled:true, health:'HEALTHY' }, { ok:true }), 'EXISTANT_ET_TESTE');
  assert.equal(classifyCapabilityTruth({ enabled:true, health:'HEALTHY', implementation_status:'STUB' }, { ok:true }), 'STUB');
  assert.equal(classifyCapabilityTruth({ enabled:false, health:'HEALTHY' }), 'BLOCKED');
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

test('deep audit fails closed on provider/cost-sensitive samples until exact zero-cost proof is supplied', async () => {
  const calls = [];
  const records = [
    { id:'web.research', name:'Web research', category:'research', provider:'external', risk:'LOW', enabled:true, health:'HEALTHY' },
    { id:'device.policy.preview', name:'Device preview', category:'device', provider:'local', risk:'LOW', enabled:true, health:'HEALTHY' },
  ];
  const fake = {
    bus: {
      refreshHealthAll: async () => records,
      list: () => records,
      execute: async (id) => { calls.push(id); return { ok:true }; },
    },
  };

  const blocked = await auditRuntimeCapabilities(fake, {
    deep:true,
    samples:{ 'web.research':{}, 'device.policy.preview':{} },
  });
  const webBlocked = blocked.capabilities.find(x => x.id === 'web.research');
  const device = blocked.capabilities.find(x => x.id === 'device.policy.preview');
  assert.equal(webBlocked.tested_now, false);
  assert.equal(webBlocked.auto_execution_blocked, 'UNKNOWN_OR_EXTERNAL_COST');
  assert.equal(webBlocked.truth_status, 'EXISTANT_NON_TESTE');
  assert.equal(device.tested_now, true);
  assert.deepEqual(calls, ['device.policy.preview']);

  const approved = await auditRuntimeCapabilities(fake, {
    deep:true,
    samples:{ 'web.research':{} },
    zeroCostCapabilityIds:['web.research'],
  });
  const webApproved = approved.capabilities.find(x => x.id === 'web.research');
  assert.equal(webApproved.tested_now, true);
  assert.equal(webApproved.auto_execution_blocked, null);
  assert.equal(webApproved.truth_status, 'EXISTANT_ET_TESTE');
  assert.deepEqual(calls, ['device.policy.preview', 'web.research']);
});

test('declared STUB and NOT_IMPLEMENTED capabilities cannot masquerade as healthy or be smoke-executed', async () => {
  const calls = [];
  const records = [
    { id:'stub', name:'Stub', category:'test', provider:'test', risk:'LOW', enabled:true, health:'HEALTHY', implementation_status:'STUB' },
    { id:'missing', name:'Missing', category:'test', provider:'test', risk:'LOW', enabled:true, health:'HEALTHY', implementation_status:'NOT_IMPLEMENTED' },
    { id:'partial', name:'Partial', category:'test', provider:'test', risk:'LOW', enabled:true, health:'HEALTHY', implementation_status:'PARTIAL' },
  ];
  const fake = {
    bus: {
      refreshHealthAll: async () => records,
      list: () => records,
      execute: async (id) => { calls.push(id); return { ok:true }; },
    },
  };
  const report = await auditRuntimeCapabilities(fake, {
    deep:true,
    samples:{ stub:{}, missing:{}, partial:{} },
  });
  const stub = report.capabilities.find(x => x.id === 'stub');
  const missing = report.capabilities.find(x => x.id === 'missing');
  const partial = report.capabilities.find(x => x.id === 'partial');
  assert.equal(stub.truth_status, 'STUB');
  assert.equal(stub.tested_now, false);
  assert.equal(missing.truth_status, 'NOT_IMPLEMENTED');
  assert.equal(missing.tested_now, false);
  assert.equal(partial.truth_status, 'EXISTANT_ET_TESTE');
  assert.deepEqual(calls, ['partial']);
});

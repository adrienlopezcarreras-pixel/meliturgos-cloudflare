import test from 'node:test';
import assert from 'node:assert/strict';
import { auditRuntimeCapabilities } from '../src/diagnostics/capability-truth-audit.js';

const githubCodeRecords = [
  { id:'code.read', name:'GitHub code read', category:'development', provider:'github', risk:'LOW', enabled:true, health:'HEALTHY' },
  { id:'code.search', name:'GitHub code search', category:'development', provider:'github', risk:'LOW', enabled:true, health:'HEALTHY' },
  { id:'code.integrity', name:'Code integrity', category:'code', provider:'mel', risk:'LOW', enabled:true, health:'HEALTHY' },
];

test('deep truth audit really executes free GitHub-backed code reads', async () => {
  const calls = [];
  const fake = {
    bus: {
      list: () => githubCodeRecords,
      refreshHealth: async id => githubCodeRecords.find(record => record.id === id),
      execute: async id => { calls.push(id); return { ok:true }; },
    },
  };
  const report = await auditRuntimeCapabilities(fake, {
    deep: true,
    samples: {
      'code.read': { path:'package.json' },
      'code.search': { query:'MELITURGOS' },
      'code.integrity': { paths:['package.json'] },
    },
  });
  for (const id of ['code.read','code.search','code.integrity']) {
    const row = report.capabilities.find(item => item.id === id);
    assert.ok(calls.includes(id), id + ' must be executed');
    assert.equal(row.auto_execution_blocked, null);
    assert.equal(row.truth_status, 'EXISTANT_ET_TESTE');
  }
});

test('deep truth audit still refuses metered model capabilities without exact zero-cost proof', async () => {
  const calls = [];
  const records = [{ id:'model.council', name:'Council', category:'orchestration', provider:'workers-ai', risk:'LOW', enabled:true, health:'HEALTHY' }];
  const fake = { bus: { list: () => records, execute: async id => { calls.push(id); return { ok:true }; } } };
  const report = await auditRuntimeCapabilities(fake, { deep:true, samples:{ 'model.council': { request:'x' } } });
  assert.deepEqual(calls, []);
  assert.equal(report.capabilities[0].auto_execution_blocked, 'UNKNOWN_OR_EXTERNAL_COST');
});

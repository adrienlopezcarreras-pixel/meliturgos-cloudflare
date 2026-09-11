import test from 'node:test';
import assert from 'node:assert/strict';
import { auditRuntimeCapabilities } from '../src/diagnostics/capability-truth-audit.js';

const githubCodeRecords = [
  { id:'code.read', name:'GitHub code read', category:'development', provider:'github', risk:'LOW', enabled:true, health:'HEALTHY' },
  { id:'code.search', name:'GitHub code search', category:'development', provider:'github', risk:'LOW', enabled:true, health:'HEALTHY' },
  { id:'code.integrity', name:'Code integrity', category:'code', provider:'mel', risk:'LOW', enabled:true, health:'HEALTHY' },
];

test('deep truth audit refuses GitHub-backed execution and health probes until exact zero-added-cost proof is supplied', async () => {
  const calls = [];
  const healthCalls = [];
  const fake = {
    bus: {
      list: () => githubCodeRecords,
      refreshHealth: async id => {
        healthCalls.push(id);
        return githubCodeRecords.find(record => record.id === id);
      },
      execute: async id => { calls.push(id); return { ok:true }; },
    },
  };

  const blocked = await auditRuntimeCapabilities(fake, {
    deep: true,
    samples: {
      'code.read': { path:'package.json' },
      'code.search': { query:'MELITURGOS' },
      'code.integrity': { paths:['package.json'] },
    },
  });

  assert.deepEqual(healthCalls, []);
  assert.deepEqual(calls, []);
  for (const id of ['code.read','code.search','code.integrity']) {
    const row = blocked.capabilities.find(item => item.id === id);
    assert.equal(row.tested_now, false);
    assert.equal(row.auto_execution_blocked, 'UNKNOWN_OR_EXTERNAL_COST');
    assert.equal(row.truth_status, 'EXISTANT_NON_TESTE');
  }

  const approved = await auditRuntimeCapabilities(fake, {
    deep: true,
    samples: { 'code.read': { path:'package.json' } },
    zeroCostCapabilityIds: ['code.read'],
  });

  assert.deepEqual(healthCalls, ['code.read']);
  assert.deepEqual(calls, ['code.read']);
  assert.equal(approved.capabilities.find(item => item.id === 'code.read').truth_status, 'EXISTANT_ET_TESTE');
  assert.equal(approved.capabilities.find(item => item.id === 'code.search').auto_execution_blocked, 'NO_BOUNDED_SAMPLE');
  assert.equal(approved.capabilities.find(item => item.id === 'code.integrity').auto_execution_blocked, 'NO_BOUNDED_SAMPLE');
});

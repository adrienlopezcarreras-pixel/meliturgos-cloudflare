import test from 'node:test';
import assert from 'node:assert/strict';
import { auditRuntimeCapabilities } from '../src/diagnostics/capability-truth-audit.js';

const meteredReadRecords = [
  { id:'conversation.list', name:'Conversations', category:'conversation', provider:'core', risk:'LOW', enabled:true, health:'HEALTHY' },
  { id:'rag.search', name:'RAG', category:'memory', provider:'core', risk:'LOW', enabled:true, health:'HEALTHY' },
  { id:'autonomy.status', name:'Autonomy status', category:'evolution', provider:'mel', risk:'LOW', enabled:true, health:'HEALTHY' },
  { id:'mentor.recent', name:'Mentor recent', category:'learning', provider:'mel', risk:'LOW', enabled:true, health:'HEALTHY' },
];

test('deep truth audit refuses metered runtime reads until exact zero-added-cost proof is supplied', async () => {
  const calls = [];
  const healthCalls = [];
  const fake = {
    bus: {
      list: () => meteredReadRecords,
      refreshHealth: async id => {
        healthCalls.push(id);
        return meteredReadRecords.find(record => record.id === id);
      },
      execute: async id => { calls.push(id); return { ok:true }; },
    },
  };

  const samples = {
    'conversation.list': {},
    'rag.search': { query:'MELITURGOS', limit:1 },
    'autonomy.status': {},
    'mentor.recent': { limit:1 },
  };

  const blocked = await auditRuntimeCapabilities(fake, { deep:true, samples });
  assert.deepEqual(healthCalls, []);
  assert.deepEqual(calls, []);
  for (const record of meteredReadRecords) {
    const row = blocked.capabilities.find(item => item.id === record.id);
    assert.equal(row.tested_now, false);
    assert.equal(row.auto_execution_blocked, 'UNKNOWN_OR_EXTERNAL_COST');
    assert.equal(row.truth_status, 'EXISTANT_NON_TESTE');
  }

  const approved = await auditRuntimeCapabilities(fake, {
    deep:true,
    samples,
    zeroCostCapabilityIds:['autonomy.status'],
  });
  assert.deepEqual(healthCalls, ['autonomy.status']);
  assert.deepEqual(calls, ['autonomy.status']);
  assert.equal(approved.capabilities.find(item => item.id === 'autonomy.status').truth_status, 'EXISTANT_ET_TESTE');
  for (const id of ['conversation.list','rag.search','mentor.recent']) {
    assert.equal(approved.capabilities.find(item => item.id === id).auto_execution_blocked, 'UNKNOWN_OR_EXTERNAL_COST');
  }
});

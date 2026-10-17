import test from 'node:test';
import assert from 'node:assert/strict';
import { auditRuntimeCapabilities } from '../src/diagnostics/capability-truth-audit.js';

const meteredReadRecords = [
  { id:'conversation.list', name:'Conversations', category:'conversation', provider:'core', risk:'LOW', enabled:true, health:'HEALTHY' },
  { id:'rag.search', name:'RAG', category:'memory', provider:'core', risk:'LOW', enabled:true, health:'HEALTHY' },
  { id:'autonomy.status', name:'Autonomy status', category:'evolution', provider:'mel', risk:'LOW', enabled:true, health:'HEALTHY' },
  { id:'mentor.recent', name:'Mentor recent', category:'learning', provider:'mel', risk:'LOW', enabled:true, health:'HEALTHY' },
];

test('deep truth audit executes free D1 reads but keeps embedding-backed search behind an exact zero-cost proof', async () => {
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

  const report = await auditRuntimeCapabilities(fake, { deep:true, samples });
  // Bounded D1 reads are free at MEL's volume: they are really executed now.
  for (const id of ['conversation.list','autonomy.status','mentor.recent']) {
    const row = report.capabilities.find(item => item.id === id);
    assert.ok(calls.includes(id), id + ' must be executed');
    assert.equal(row.truth_status, 'EXISTANT_ET_TESTE');
  }
  // rag.search may call a metered embedding model: still blocked without proof.
  const rag = report.capabilities.find(item => item.id === 'rag.search');
  assert.equal(calls.includes('rag.search'), false);
  assert.equal(rag.auto_execution_blocked, 'UNKNOWN_OR_EXTERNAL_COST');

  const approved = await auditRuntimeCapabilities(fake, { deep:true, samples, zeroCostCapabilityIds:['rag.search'] });
  assert.equal(approved.capabilities.find(item => item.id === 'rag.search').truth_status, 'EXISTANT_ET_TESTE');
});

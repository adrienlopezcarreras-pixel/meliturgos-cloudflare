import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequestGet as renderFullMode } from '../../src/pages/full-interface-v2.js';
import { createGen2Runtime } from '../../src/core/orchestrator/gen2-runtime.js';
import { flattenRoadmap } from '../../src/roadmap/master-roadmap.js';

test('MEL reconciliation keeps full-mode button ids unique and removes redundant mobile resume', async () => {
  const response = await renderFullMode({});
  assert.equal(response.status, 200);
  const html = await response.text();
  const ids = [...html.matchAll(/<button\b[^>]*\bid="([^"]+)"/gi)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate button ids');
  assert.equal(ids.includes('mobileResumeAutonomy'), false);
  assert.equal(ids.filter(id => id === 'mobilePauseAutonomy').length, 1);
});

test('MEL reconciliation keeps every registered capability unique, executable and contract-valid', () => {
  const runtime = createGen2Runtime({ env: {} });
  const records = runtime.bus.list();
  const ids = records.map(row => row.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate capability id');

  for (const row of records) {
    const declared = String(row.implementation_status || '').toUpperCase();
    assert.notEqual(declared, 'STUB', 'stub capability remains registered: ' + row.id);
    assert.notEqual(declared, 'NOT_IMPLEMENTED', 'unimplemented capability remains registered: ' + row.id);
    const contract = runtime.bus.contract(row.id);
    assert.equal(contract.valid, true, 'invalid capability contract: ' + row.id);
    assert.equal(contract.handler_registered, true, 'missing capability handler: ' + row.id);
  }
});

test('MEL reconciliation roadmap leaves the founder cycle and the manifesto account open', () => {
  const open = flattenRoadmap()
    .filter(row => row.status !== 'DONE_VERIFIED')
    .map(row => ({ id: row.id, status: row.status }));
  assert.deepEqual(open, [
    { id: 'MEL-AUDIT-02', status: 'IN_PROGRESS' },
    { id: 'MEL-AUDIT-03', status: 'IN_PROGRESS' },
    { id: 'MEL-AUDIT-04', status: 'PLANNED' },
    { id: 'MEL-AUDIT-05', status: 'PLANNED' },
    { id: 'MEL-AUDIT-06', status: 'PLANNED' },
    { id: 'MEL-AUDIT-07', status: 'IN_PROGRESS' },
    { id: 'MEL-FOUNDER-01', status: 'IN_PROGRESS' },
    { id: 'MEL-FOUNDER-02', status: 'IN_PROGRESS' },
    { id: 'MEL-FOUNDER-03', status: 'PLANNED' },
    { id: 'MEL-FOUNDER-04', status: 'PLANNED' },
    { id: 'MEL-FOUNDER-05', status: 'PLANNED' },
    { id: 'MEL-FOUNDER-06', status: 'BLOCKED_HUMAN' },
    { id: 'MEL-FOUNDER-07', status: 'PLANNED' },
    { id: 'MEL-FOUNDER-08', status: 'BLOCKED_EXTERNAL' },
    { id: 'MEL-UI-AUDIT-01', status: 'PLANNED' },
    { id: 'MEL-UI-AUDIT-02', status: 'PLANNED' },
    { id: 'MEL-UI-AUDIT-03', status: 'PLANNED' },
    { id: 'MEL-UI-AUDIT-04', status: 'PLANNED' },
    { id: 'MEL-UI-AUDIT-05', status: 'PLANNED' },
    { id: 'MEL-UI-AUDIT-06', status: 'PLANNED' },
    { id: 'MEL-UI-AUDIT-07', status: 'PLANNED' },
    { id: 'MEL-MANIFEST-01', status: 'PLANNED' },
    { id: 'MEL-MANIFEST-02', status: 'PLANNED' },
    { id: 'MEL-MANIFEST-03', status: 'PLANNED' },
    { id: 'MEL-MANIFEST-04', status: 'PLANNED' },
    { id: 'MEL-MANIFEST-05', status: 'PLANNED' },
    { id: 'MEL-MANIFEST-06', status: 'PLANNED' },
    { id: 'MEL-MANIFEST-07', status: 'PLANNED' },
    { id: 'MEL-MANIFEST-08', status: 'PLANNED' },
    { id: 'MEL-MANIFEST-09', status: 'PLANNED' },
    { id: 'MEL-MANIFEST-10', status: 'PLANNED' },
    { id: 'MEL-CHAT-01', status: 'IN_PROGRESS' },
    { id: 'MEL-CHAT-02', status: 'IN_PROGRESS' },
    { id: 'MEL-CHAT-03', status: 'IN_PROGRESS' },
    { id: 'MEL-CHAT-04', status: 'IN_PROGRESS' },
    { id: 'MEL-CHAT-05', status: 'IN_PROGRESS' },
    { id: 'MEL-CHAT-06', status: 'PLANNED' },
    { id: 'MEL-CHAT-07', status: 'IN_PROGRESS' },
    { id: 'MEL-CHAT-08', status: 'IN_PROGRESS' },
  ]);
});

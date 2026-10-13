import test from 'node:test';
import assert from 'node:assert/strict';
import { auditRuntimeCapabilities, SAFE_SAMPLES } from '../src/diagnostics/capability-truth-audit.js';

function busFor(work = []) {
  const records = ['work.status', 'work.artifacts', 'conversation.quality.recent'].map(id => ({
    id, name: id, category: 'diagnostic', provider: 'core', risk: 'LOW',
    enabled: true, health: 'HEALTHY', implementation_status: 'IMPLEMENTED',
  }));
  const called = [];
  return {
    called,
    bus: {
      list: () => records,
      execute: async (id, input) => {
        called.push({ id, input });
        if (id === 'work.list') return { ok: true, work };
        if (id === 'work.status') {
          assert.equal(input.id, 'real-dag-1');
          return { id: input.id, status: 'COMPLETED' };
        }
        if (id === 'work.artifacts') {
          assert.equal(input.id, 'real-dag-1');
          return { id: input.id, artifacts: [] };
        }
        if (id === 'conversation.quality.recent') {
          assert.deepEqual(input, { limit: 1 });
          return { incidents: [], count: 0 };
        }
        throw new Error('UNEXPECTED_CAPABILITY');
      },
    },
  };
}

test('bounded Work metadata proofs use a real runtime Work ID and never create work', async () => {
  const runtime = busFor([{ id: 'real-dag-1', status: 'COMPLETED' }]);
  const report = await auditRuntimeCapabilities({ bus: runtime.bus }, { deep: true });
  for (const id of ['work.status', 'work.artifacts', 'conversation.quality.recent']) {
    const row = report.capabilities.find(x => x.id === id);
    assert.equal(row.truth_status, 'EXISTANT_ET_TESTE', id);
    assert.equal(row.tested_now, true, id);
  }
  assert.equal(runtime.called.filter(x => x.id === 'work.list').length, 2);
  assert.ok(runtime.called.every(x => !['work.create','work.run','autonomy.resume','autonomy.tick'].includes(x.id)));
  assert.ok(Object.hasOwn(SAFE_SAMPLES, 'work.status'));
  assert.ok(Object.hasOwn(SAFE_SAMPLES, 'work.artifacts'));
});

test('virgin work store is not fabricated into a successful capability execution', async () => {
  const runtime = busFor([]);
  const report = await auditRuntimeCapabilities({ bus: runtime.bus }, { deep: true });
  for (const id of ['work.status', 'work.artifacts']) {
    const row = report.capabilities.find(x => x.id === id);
    assert.equal(row.auto_execution_blocked, 'NO_RUNTIME_FIXTURE', id);
    assert.equal(row.tested_now, false, id);
    assert.equal(row.truth_status, 'EXISTANT_NON_TESTE', id);
  }
  assert.equal(runtime.called.some(x => ['work.status','work.artifacts'].includes(x.id)), false);
});

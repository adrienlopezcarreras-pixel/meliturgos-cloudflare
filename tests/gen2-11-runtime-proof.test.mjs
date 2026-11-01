import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { classifyRoadmapItem, ROADMAP_PROOF_SOURCES } from '../src/roadmap/roadmap-truth.js';
test('GEN2-11 exercises real KnowledgeGraph contract in an isolated graph', async () => {
  const bus = createDefaultCapabilityBus({ env:{} });
  assert.deepEqual(await bus.execute('knowledge.graph.verify', {}, { owner:'test', permissions:[] }), { ok:true, superseded:true });
});
test('GEN2-11 stays UNPROVEN absent a real recent production execution', () => {
  assert.deepEqual(ROADMAP_PROOF_SOURCES['GEN2-11'], { capabilities:['knowledge.graph.verify'] });
  assert.equal(classifyRoadmapItem('GEN2-11', { capabilities:new Map(), computer:new Map() }).truth, 'UNPROVEN');
});

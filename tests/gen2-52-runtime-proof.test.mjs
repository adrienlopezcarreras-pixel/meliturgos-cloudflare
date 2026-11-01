import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { classifyRoadmapItem, ROADMAP_PROOF_SOURCES } from '../src/roadmap/roadmap-truth.js';
test('GEN2-52 executes isolated real version, snapshot and rollback contract', async () => {
  const bus = createDefaultCapabilityBus({ env: {} });
  const result = await bus.execute('prompt.strategy.versioning.verify', {}, { owner:'test', permissions:[] });
  assert.deepEqual(result, { ok:true, rollback:'v1' });
});
test('GEN2-52 is not automatically VERIFIED_LIVE on a mapping alone', () => {
  assert.deepEqual(ROADMAP_PROOF_SOURCES['GEN2-52'], { capabilities:['prompt.strategy.versioning.verify'] });
  assert.equal(classifyRoadmapItem('GEN2-52', { capabilities:new Map(), computer:new Map() }).truth, 'UNPROVEN');
});

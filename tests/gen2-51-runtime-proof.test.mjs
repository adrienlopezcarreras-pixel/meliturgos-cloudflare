import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { classifyRoadmapItem, ROADMAP_PROOF_SOURCES } from '../src/roadmap/roadmap-truth.js';

test('GEN2-51 runtime verification executes real API version registry and resolver', async () => {
  const bus = createDefaultCapabilityBus({ env: {} });
  const result = await bus.execute('api.versioning.verify', {}, { owner: 'test', permissions: [] });
  assert.equal(result.ok, true);
  assert.equal(result.version, 'v1');
  assert.ok(result.routes > 0);
});

test('GEN2-51 remains UNPROVEN until production capability execution is recorded', () => {
  assert.deepEqual(ROADMAP_PROOF_SOURCES['GEN2-51'], { capabilities: ['api.versioning.verify'] });
  assert.equal(classifyRoadmapItem('GEN2-51', { capabilities: new Map(), computer: new Map() }).truth, 'UNPROVEN');
});

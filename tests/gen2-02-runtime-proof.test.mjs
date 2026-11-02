import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { classifyRoadmapItem, ROADMAP_PROOF_SOURCES } from '../src/roadmap/roadmap-truth.js';

test('GEN2-02 executes a real portable persona composition with no secret output', async () => {
  const events = [];
  const bus = createDefaultCapabilityBus({ audit: async event => events.push(event), env: {} });
  const result = await bus.execute('identity.portability.verify', {}, { owner: 'test', permissions: [] });
  assert.deepEqual(result, { ok: true, name: 'MEL', language: 'fr' });
  assert.ok(events.some(event => event.capability === 'identity.portability.verify' && event.status === 'SUCCEEDED'));
  assert.equal(JSON.stringify(result).includes('test-owner'), false);
});

test('GEN2-02 remains UNPROVEN until a successful runtime execution is recorded', () => {
  assert.deepEqual(ROADMAP_PROOF_SOURCES['GEN2-02'], { capabilities: ['identity.portability.verify'] });
  const unrun = classifyRoadmapItem('GEN2-02', { capabilities: new Map(), computer: new Map() });
  assert.equal(unrun.truth, 'UNPROVEN');
  const run = classifyRoadmapItem('GEN2-02', { capabilities: new Map([
    ['identity.portability.verify', { ok: 1, ko: 0, last_ok: Date.now() }]
  ]), computer: new Map() });
  assert.equal(run.truth, 'VERIFIED_LIVE');
});

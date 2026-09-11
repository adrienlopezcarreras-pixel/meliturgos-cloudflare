import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';

const context = { owner: 'test-owner', permissions: [], requestId: 'provider-fail-closed' };

for (const capability of [
  ['augmentio.fanout', { input: 'inspect safely' }],
  ['council.state-of-play', { goal: 'inspect safely' }],
  ['evolution.preflight', { goal: 'inspect safely' }],
]) {
  test(`${capability[0]} is truthfully DEGRADED and fails closed without AI binding`, async () => {
    const bus = createDefaultCapabilityBus({ env: {} });
    const record = bus.describe(capability[0]);

    assert.equal(record.enabled, true);
    assert.equal(record.risk, 'LOW');
    assert.deepEqual(record.permissions, []);
    assert.equal(record.health, 'DEGRADED');

    await assert.rejects(
      bus.execute(capability[0], capability[1], context),
      error => error?.message === 'AI_BINDING_MISSING' || error?.code === 'AI_BINDING_MISSING'
    );
  });
}

test('evolution.enqueue remains MEDIUM risk and is not deep-executed by this zero-cost proof', () => {
  const bus = createDefaultCapabilityBus({ env: {} });
  const record = bus.describe('evolution.enqueue');
  assert.equal(record.enabled, true);
  assert.equal(record.risk, 'MEDIUM');
  assert.equal(record.health, 'DEGRADED');
});

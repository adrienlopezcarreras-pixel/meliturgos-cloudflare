import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';

const context = { owner: 'test-owner', permissions: [], requestId: 'd1-read-fail-closed' };

for (const [id, input] of [
  ['rag.search', { query: 'inspect safely' }],
  ['conversation.list', {}],
]) {
  test(`${id} is truthfully DEGRADED and fails closed without DB binding`, async () => {
    const bus = createDefaultCapabilityBus({ env: { MELITURGOS_USER: 'test-owner' } });
    const record = bus.describe(id);

    assert.equal(record.enabled, true);
    assert.equal(record.risk, 'LOW');
    assert.deepEqual(record.permissions, []);
    assert.equal(record.health, 'DEGRADED');

    await assert.rejects(
      bus.execute(id, input, context),
      error => error?.message === 'DB_BINDING_MISSING' || error?.code === 'DB_BINDING_MISSING'
    );
  });
}

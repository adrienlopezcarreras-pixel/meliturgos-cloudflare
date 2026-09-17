import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityBus } from '../src/capabilities/capability-bus.js';

test('CapabilityBus preserves SAFE_IDLE as PROTECTED instead of DEGRADED', async () => {
  const bus = new CapabilityBus();
  bus.discover({
    id: 'protected.test',
    name: 'Protected test',
    category: 'diagnostic',
    version: '1.0.0',
    provider: 'test',
    description: 'Zero-cost protected fixture',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: 'DEGRADED',
    enabled: true,
    healthcheck: async () => ({ status: 'SAFE_IDLE' }),
  }, async () => ({ ok: true }));

  const record = await bus.refreshHealth('protected.test');
  assert.equal(record.health, 'PROTECTED');
});

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
    healthcheck: async () => ({ status: 'SAFE_IDLE', reason: 'OWNER_APPROVAL_REQUIRED' }),
  }, async () => ({ ok: true }));

  const record = await bus.refreshHealth('protected.test');
  assert.equal(record.health, 'PROTECTED');
  assert.equal(record.health_detail, 'OWNER_APPROVAL_REQUIRED');
});


test('CapabilityBus exposes bounded healthcheck failure detail instead of a silent degraded badge', async () => {
  const bus = new CapabilityBus();
  bus.discover({
    id: 'degraded.test',
    name: 'Degraded test',
    category: 'diagnostic',
    version: '1.0.0',
    provider: 'test',
    description: 'Health failure fixture',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: 'HEALTHY',
    enabled: true,
    healthcheck: async () => {
      const error = new Error('upstream unavailable');
      error.code = 'UPSTREAM_UNAVAILABLE';
      throw error;
    },
  }, async () => ({ ok: true }));

  const record = await bus.refreshHealth('degraded.test');
  assert.equal(record.health, 'DEGRADED');
  assert.equal(record.health_detail, 'UPSTREAM_UNAVAILABLE');
});

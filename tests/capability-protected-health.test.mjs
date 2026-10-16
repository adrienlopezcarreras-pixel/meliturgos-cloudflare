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

test('CapabilityBus redacts provider free-text and secrets from public health inventory', async () => {
  const bus = new CapabilityBus();
  const record = {
    id: 'private.health', name: 'Private health', category: 'test',
    version: '1.0.0', provider: 'test', description: 'Privacy regression',
    input_schema: { type: 'object' }, output_schema: { type: 'object' },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true,
  };
  let mode = 'reason';
  bus.discover(record, async () => ({ ok: true }), async () => {
    if (mode === 'reason') {
      return { status: 'DEGRADED', reason: 'OAuth failed: https://private.example/path?token=my-secret' };
    }
    if (mode === 'exception') {
      throw new Error('Unauthorized using token private-account-access-key');
    }
    const error = new Error('Private database connection details should never leak');
    error.code = 'UPSTREAM_UNAVAILABLE';
    throw error;
  });
  const first = await bus.refreshHealth('private.health');
  assert.equal(first.health, 'DEGRADED');
  assert.equal(first.health_detail, 'HEALTHCHECK_DETAIL_REDACTED');
  assert.equal(JSON.stringify(bus.list()).includes('my-secret'), false);
  mode = 'exception';
  const second = await bus.refreshHealth('private.health');
  assert.equal(second.health_detail, 'HEALTHCHECK_FAILED');
  assert.equal(JSON.stringify(bus.describe('private.health')).includes('private-account'), false);
  mode = 'coded';
  const third = await bus.refreshHealth('private.health');
  assert.equal(third.health_detail, 'UPSTREAM_UNAVAILABLE');
});

test('CapabilityBus redacts malformed health codes rather than truncating private data', async () => {
  const bus = new CapabilityBus();
  bus.discover({
    id: 'bad.code', name: 'Bad code', category: 'test', version: '1.0.0',
    provider: 'test', description: 'Redaction regression',
    input_schema: { type: 'object' }, output_schema: { type: 'object' },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true,
  }, async () => ({ ok: true }), async () => {
    const error = new Error('secret');
    error.code = 'ERROR token=private-value';
    throw error;
  });
  const result = await bus.refreshHealth('bad.code');
  assert.equal(result.health, 'DEGRADED');
  assert.equal(result.health_detail, 'HEALTHCHECK_FAILED');
  assert.doesNotMatch(JSON.stringify(result), /private-value/);
});

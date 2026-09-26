import test from 'node:test';
import assert from 'node:assert/strict';

import { createColdObjectStoreAdapter } from '../../src/resilience/cold-standby-object-adapter.js';

function memoryStore() {
  const data = new Map();
  return {
    data,
    async put(key, value, options) {
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
      data.set(key, { bytes: new Uint8Array(bytes), options });
    },
    async get(key) {
      const row = data.get(key);
      if (!row) return null;
      return { async arrayBuffer() { return row.bytes.buffer.slice(row.bytes.byteOffset, row.bytes.byteOffset + row.bytes.byteLength); } };
    },
  };
}

function plan(overrides = {}) {
  return {
    standby_id: 'standby-a',
    destination_id: 'external-cold',
    manifest_sha256: 'a'.repeat(64),
    activation_allowed: false,
    ...overrides,
  };
}

test('MEL-RES-04 copies opaque encrypted bytes and verifies readback without production mutation', async () => {
  const store = memoryStore();
  const adapter = createColdObjectStoreAdapter({ store, prefix: 'archive' });
  const payload = new TextEncoder().encode('encrypted-envelope-'.repeat(4));

  const result = await adapter.prepare(plan(), { encrypted_bundle: payload });

  assert.equal(result.ok, true);
  assert.equal(result.encrypted, true);
  assert.equal(result.readback_verified, true);
  assert.equal(result.production_mutation, false);
  assert.equal(result.activation_performed, false);
  assert.match(result.object_key, /^archive\/cold-standby\/external-cold\/standby-a\//);
  assert.equal(store.data.size, 1);
});

test('MEL-RES-04 prepare refuses missing or tiny encrypted material', async () => {
  const adapter = createColdObjectStoreAdapter({ store: memoryStore() });
  await assert.rejects(() => adapter.prepare(plan(), {}), { code: 'COLD_STANDBY_ENCRYPTED_BUNDLE_REQUIRED' });
  await assert.rejects(() => adapter.prepare(plan(), { encrypted_bundle: 'tiny' }), { code: 'COLD_STANDBY_ENCRYPTED_BUNDLE_TOO_SMALL' });
});

test('MEL-RES-04 prepare refuses any activation-enabled plan', async () => {
  const adapter = createColdObjectStoreAdapter({ store: memoryStore() });
  await assert.rejects(
    () => adapter.prepare(plan({ activation_allowed: true }), { encrypted_bundle: 'x'.repeat(64) }),
    { code: 'COLD_STANDBY_PREPARE_MUST_NOT_ACTIVATE' },
  );
});

test('MEL-RES-04 activation only materializes verified restore bytes and never switches traffic', async () => {
  const store = memoryStore();
  const adapter = createColdObjectStoreAdapter({ store });
  const payload = new TextEncoder().encode('encrypted-envelope-'.repeat(4));
  const prepared = await adapter.prepare(plan(), { encrypted_bundle: payload });

  const activated = await adapter.activate(
    plan({ activation_allowed: true }),
    { expected_content_sha256: prepared.content_sha256 },
  );

  assert.equal(activated.restore_material_ready, true);
  assert.equal(activated.production_mutation, false);
  assert.equal(activated.traffic_switched, false);
  assert.equal(activated.activation_performed, false);
  assert.equal(activated.content_sha256, prepared.content_sha256);
});

test('MEL-RES-04 activation fails closed on integrity mismatch', async () => {
  const store = memoryStore();
  const adapter = createColdObjectStoreAdapter({ store });
  await adapter.prepare(plan(), { encrypted_bundle: 'encrypted-envelope-'.repeat(4) });

  await assert.rejects(
    () => adapter.activate(plan({ activation_allowed: true }), { expected_content_sha256: 'b'.repeat(64) }),
    { code: 'COLD_STANDBY_OBJECT_INTEGRITY_MISMATCH' },
  );
});

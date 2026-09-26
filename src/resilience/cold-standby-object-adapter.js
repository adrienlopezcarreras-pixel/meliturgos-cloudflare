import { stableStringify } from './recovery-bundle.js';

export const COLD_OBJECT_ADAPTER_SCHEMA = 'mel.resilience.cold-object-adapter.v1';

function fail(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  throw error;
}

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === 'string') return new TextEncoder().encode(value);
  if (value && typeof value === 'object') return new TextEncoder().encode(stableStringify(value));
  fail('COLD_STANDBY_ENCRYPTED_BUNDLE_REQUIRED');
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function requireStore(store) {
  if (!store || typeof store.put !== 'function' || typeof store.get !== 'function') {
    fail('COLD_STANDBY_OBJECT_STORE_REQUIRED', 503);
  }
  return store;
}

function keyFor(plan) {
  const destination = String(plan?.destination_id || '').trim();
  const manifest = String(plan?.manifest_sha256 || '').trim().toLowerCase();
  const standby = String(plan?.standby_id || '').trim();
  if (!destination) fail('COLD_STANDBY_DESTINATION_REQUIRED');
  if (!standby) fail('COLD_STANDBY_ID_REQUIRED');
  if (!/^[a-f0-9]{64}$/.test(manifest)) fail('COLD_STANDBY_MANIFEST_REQUIRED');
  return `cold-standby/${destination}/${standby}/${manifest}.enc`;
}

async function readBytes(object) {
  if (!object) return null;
  if (typeof object.arrayBuffer === 'function') return new Uint8Array(await object.arrayBuffer());
  if (typeof object.text === 'function') return new TextEncoder().encode(await object.text());
  if (object instanceof Uint8Array) return object;
  return null;
}

/**
 * Provider-neutral cold destination adapter.
 *
 * The adapter only stores/reads an already-encrypted recovery bundle. It never
 * deploys code, changes DNS, promotes a runtime, or switches traffic. A later
 * owner-approved/manual operator may consume the verified restore material.
 */
export function createColdObjectStoreAdapter({
  store,
  prefix = '',
} = {}) {
  const objectStore = requireStore(store);
  const normalizedPrefix = String(prefix || '').replace(/^\/+|\/+$/g, '');

  function objectKey(plan) {
    const base = keyFor(plan);
    return normalizedPrefix ? `${normalizedPrefix}/${base}` : base;
  }

  return Object.freeze({
    schema: COLD_OBJECT_ADAPTER_SCHEMA,

    async prepare(plan, context = {}) {
      if (plan?.activation_allowed === true) fail('COLD_STANDBY_PREPARE_MUST_NOT_ACTIVATE');
      const encrypted = context.encrypted_bundle;
      if (encrypted == null) fail('COLD_STANDBY_ENCRYPTED_BUNDLE_REQUIRED');
      const bytes = asBytes(encrypted);
      if (bytes.byteLength < 32) fail('COLD_STANDBY_ENCRYPTED_BUNDLE_TOO_SMALL');

      const contentSha256 = await sha256(bytes);
      const key = objectKey(plan);
      await objectStore.put(key, bytes, {
        customMetadata: {
          schema: COLD_OBJECT_ADAPTER_SCHEMA,
          standby_id: String(plan.standby_id || ''),
          manifest_sha256: String(plan.manifest_sha256 || ''),
          content_sha256: contentSha256,
          encrypted: 'true',
        },
      });

      const readback = await readBytes(await objectStore.get(key));
      if (!readback) fail('COLD_STANDBY_READBACK_MISSING', 503);
      const readbackSha256 = await sha256(readback);
      if (readbackSha256 !== contentSha256) fail('COLD_STANDBY_READBACK_INTEGRITY_MISMATCH', 409);

      return Object.freeze({
        ok: true,
        schema: COLD_OBJECT_ADAPTER_SCHEMA,
        object_key: key,
        content_sha256: contentSha256,
        bytes: bytes.byteLength,
        encrypted: true,
        readback_verified: true,
        production_mutation: false,
        activation_performed: false,
      });
    },

    async activate(plan, context = {}) {
      // "Activation" here means materializing verified restore input for a
      // human/operator. It deliberately does NOT deploy or redirect anything.
      if (plan?.activation_allowed !== true) fail('COLD_STANDBY_ACTIVATION_NOT_AUTHORIZED', 403);
      const key = objectKey(plan);
      const object = await objectStore.get(key);
      const bytes = await readBytes(object);
      if (!bytes) fail('COLD_STANDBY_OBJECT_NOT_FOUND', 404);

      const contentSha256 = await sha256(bytes);
      const expected = String(context.expected_content_sha256 || '').trim().toLowerCase();
      if (expected && contentSha256 !== expected) fail('COLD_STANDBY_OBJECT_INTEGRITY_MISMATCH', 409);

      return Object.freeze({
        ok: true,
        schema: COLD_OBJECT_ADAPTER_SCHEMA,
        object_key: key,
        content_sha256: contentSha256,
        bytes: bytes.byteLength,
        encrypted: true,
        restore_material_ready: true,
        production_mutation: false,
        traffic_switched: false,
        activation_performed: false,
      });
    },
  });
}

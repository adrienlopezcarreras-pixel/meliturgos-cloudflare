import { stableStringify } from '../resilience/recovery-bundle.js';

export const ENCRYPTED_BACKUP_SCHEMA = 'MEL_ENCRYPTED_BACKUP_V1';
export const ENCRYPTED_BACKUP_ALGORITHM = 'AES-GCM-256';

const KEY_BYTES = 32;
const IV_BYTES = 12;
const HASH_RE = /^[a-f0-9]{64}$/i;

function encryptionError(code, status = 400) {
  return Object.assign(new Error(code), { code, status });
}

function asText(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + 0x8000)));
  }
  return btoa(binary);
}

function base64ToBytes(value, code = 'BACKUP_ENCRYPTION_BASE64_INVALID') {
  try {
    const binary = atob(String(value || ''));
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  } catch {
    throw encryptionError(code);
  }
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function importAesKey(keyBytes) {
  if (!(keyBytes instanceof Uint8Array) || keyBytes.byteLength !== KEY_BYTES) {
    throw encryptionError('BACKUP_ENCRYPTION_KEY_MUST_BE_32_BYTES');
  }
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt']);
}

function aadRecord(snapshot, keyId) {
  return {
    schema: ENCRYPTED_BACKUP_SCHEMA,
    algorithm: ENCRYPTED_BACKUP_ALGORITHM,
    key_id: keyId,
    snapshot_id: asText(snapshot?.id, 160),
    snapshot_schema: asText(snapshot?.schema, 120),
    integrity_sha256: asText(snapshot?.integritySha256, 64).toLowerCase(),
  };
}

function validateEnvelopeShape(envelope) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw encryptionError('BACKUP_ENCRYPTED_ENVELOPE_REQUIRED');
  }
  if (envelope.schema !== ENCRYPTED_BACKUP_SCHEMA) throw encryptionError('BACKUP_ENCRYPTED_SCHEMA_INVALID');
  if (envelope.algorithm !== ENCRYPTED_BACKUP_ALGORITHM) throw encryptionError('BACKUP_ENCRYPTED_ALGORITHM_INVALID');
  if (!asText(envelope.key_id, 200)) throw encryptionError('BACKUP_ENCRYPTED_KEY_ID_REQUIRED');
  if (!asText(envelope.iv_b64, 100)) throw encryptionError('BACKUP_ENCRYPTED_IV_REQUIRED');
  if (!asText(envelope.ciphertext_b64, 2_000_000)) throw encryptionError('BACKUP_ENCRYPTED_CIPHERTEXT_REQUIRED');
  if (!HASH_RE.test(asText(envelope.plaintext_sha256, 64))) throw encryptionError('BACKUP_ENCRYPTED_PLAINTEXT_HASH_INVALID');
  if (!HASH_RE.test(asText(envelope.ciphertext_sha256, 64))) throw encryptionError('BACKUP_ENCRYPTED_CIPHERTEXT_HASH_INVALID');
  if (!envelope.aad || typeof envelope.aad !== 'object' || Array.isArray(envelope.aad)) {
    throw encryptionError('BACKUP_ENCRYPTED_AAD_REQUIRED');
  }
  return true;
}

export function decodeBackupEncryptionKey(value) {
  const bytes = base64ToBytes(value, 'BACKUP_ENCRYPTION_KEY_BASE64_INVALID');
  if (bytes.byteLength !== KEY_BYTES) throw encryptionError('BACKUP_ENCRYPTION_KEY_MUST_BE_32_BYTES');
  return bytes;
}

export function createBackupEncryptionCodec({
  keyBytes,
  keyId,
  randomBytes = size => crypto.getRandomValues(new Uint8Array(size)),
} = {}) {
  const normalizedKeyId = asText(keyId, 200);
  if (!normalizedKeyId) throw encryptionError('BACKUP_ENCRYPTION_KEY_ID_REQUIRED');
  if (!(keyBytes instanceof Uint8Array) || keyBytes.byteLength !== KEY_BYTES) {
    throw encryptionError('BACKUP_ENCRYPTION_KEY_MUST_BE_32_BYTES');
  }
  if (typeof randomBytes !== 'function') throw encryptionError('BACKUP_ENCRYPTION_RANDOM_SOURCE_REQUIRED');

  let importedKey;
  async function key() {
    importedKey ||= importAesKey(keyBytes);
    return importedKey;
  }

  return Object.freeze({
    schema: ENCRYPTED_BACKUP_SCHEMA,
    algorithm: ENCRYPTED_BACKUP_ALGORITHM,
    key_id: normalizedKeyId,

    async seal(snapshot) {
      if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || !snapshot.id) {
        throw encryptionError('BACKUP_ENCRYPTION_SNAPSHOT_REQUIRED');
      }
      const plaintext = new TextEncoder().encode(JSON.stringify(snapshot));
      const iv = randomBytes(IV_BYTES);
      if (!(iv instanceof Uint8Array) || iv.byteLength !== IV_BYTES) {
        throw encryptionError('BACKUP_ENCRYPTION_IV_INVALID');
      }

      const aad = aadRecord(snapshot, normalizedKeyId);
      const aadBytes = new TextEncoder().encode(stableStringify(aad));
      const encrypted = await crypto.subtle.encrypt({
        name: 'AES-GCM',
        iv,
        additionalData: aadBytes,
        tagLength: 128,
      }, await key(), plaintext);
      const ciphertext = new Uint8Array(encrypted);

      return {
        schema: ENCRYPTED_BACKUP_SCHEMA,
        algorithm: ENCRYPTED_BACKUP_ALGORITHM,
        key_id: normalizedKeyId,
        iv_b64: bytesToBase64(iv),
        ciphertext_b64: bytesToBase64(ciphertext),
        plaintext_sha256: await sha256Hex(plaintext),
        ciphertext_sha256: await sha256Hex(ciphertext),
        aad,
      };
    },

    async open(envelope) {
      validateEnvelopeShape(envelope);
      if (envelope.key_id !== normalizedKeyId) throw encryptionError('BACKUP_ENCRYPTION_KEY_ID_MISMATCH');

      const iv = base64ToBytes(envelope.iv_b64);
      if (iv.byteLength !== IV_BYTES) throw encryptionError('BACKUP_ENCRYPTED_IV_INVALID');
      const ciphertext = base64ToBytes(envelope.ciphertext_b64);
      const ciphertextSha = await sha256Hex(ciphertext);
      if (ciphertextSha !== String(envelope.ciphertext_sha256).toLowerCase()) {
        throw encryptionError('BACKUP_ENCRYPTED_CIPHERTEXT_INTEGRITY_MISMATCH', 409);
      }

      const aadBytes = new TextEncoder().encode(stableStringify(envelope.aad));
      let decrypted;
      try {
        decrypted = await crypto.subtle.decrypt({
          name: 'AES-GCM',
          iv,
          additionalData: aadBytes,
          tagLength: 128,
        }, await key(), ciphertext);
      } catch {
        throw encryptionError('BACKUP_DECRYPTION_FAILED', 409);
      }

      const plaintext = new Uint8Array(decrypted);
      const plaintextSha = await sha256Hex(plaintext);
      if (plaintextSha !== String(envelope.plaintext_sha256).toLowerCase()) {
        throw encryptionError('BACKUP_ENCRYPTED_PLAINTEXT_INTEGRITY_MISMATCH', 409);
      }

      let snapshot;
      try {
        snapshot = JSON.parse(new TextDecoder().decode(plaintext));
      } catch {
        throw encryptionError('BACKUP_DECRYPTED_JSON_INVALID', 409);
      }
      if (snapshot?.id !== envelope.aad?.snapshot_id) throw encryptionError('BACKUP_DECRYPTED_SNAPSHOT_ID_MISMATCH', 409);
      if (snapshot?.schema !== envelope.aad?.snapshot_schema) throw encryptionError('BACKUP_DECRYPTED_SCHEMA_MISMATCH', 409);
      if (String(snapshot?.integritySha256 || '').toLowerCase() !== String(envelope.aad?.integrity_sha256 || '').toLowerCase()) {
        throw encryptionError('BACKUP_DECRYPTED_INTEGRITY_BINDING_MISMATCH', 409);
      }
      return snapshot;
    },
  });
}

export function createEnvBackupEncryptionCodec(env = {}) {
  const keyId = asText(env.MEL_BACKUP_ENCRYPTION_KEY_ID, 200);
  const encoded = asText(env.MEL_BACKUP_ENCRYPTION_KEY_B64, 1000);
  if (!keyId) throw encryptionError('BACKUP_ENCRYPTION_KEY_ID_REQUIRED', 503);
  if (!encoded) throw encryptionError('BACKUP_ENCRYPTION_KEY_REQUIRED', 503);
  return createBackupEncryptionCodec({
    keyId,
    keyBytes: decodeBackupEncryptionKey(encoded),
  });
}

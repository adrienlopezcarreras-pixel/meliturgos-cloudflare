export const MEDIA_VAULT_SCHEMA = 'MEL_MEDIA_VAULT_V1';
export const MEDIA_VAULT_ALGORITHM = 'AES-GCM-256';

const KEY_BYTES = 32;
const IV_BYTES = 12;
const HASH_RE = /^[a-f0-9]{64}$/i;

function mediaVaultError(code, status = 400) {
  return Object.assign(new Error(code), { code, status });
}

function clean(value, max = 400) {
  return String(value ?? '').trim().slice(0, max);
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + 0x8000)));
  }
  return btoa(binary);
}

function base64ToBytes(value, code = 'MEDIA_VAULT_BASE64_INVALID') {
  try {
    const binary = atob(String(value || ''));
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  } catch {
    throw mediaVaultError(code, 503);
  }
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function aadBytes(aad) {
  return new TextEncoder().encode(JSON.stringify(stable(aad)));
}

async function importKey(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== KEY_BYTES) {
    throw mediaVaultError('MEDIA_VAULT_KEY_MUST_BE_32_BYTES', 503);
  }
  return crypto.subtle.importKey('raw', bytes, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
}

export function decodeMediaVaultKey(value) {
  const bytes = base64ToBytes(value, 'MEDIA_VAULT_KEY_BASE64_INVALID');
  if (bytes.byteLength !== KEY_BYTES) throw mediaVaultError('MEDIA_VAULT_KEY_MUST_BE_32_BYTES', 503);
  return bytes;
}

export function createMediaVaultCodec({
  keyBytes,
  keyId,
  randomBytes = size => crypto.getRandomValues(new Uint8Array(size)),
} = {}) {
  const normalizedKeyId = clean(keyId, 200);
  if (!normalizedKeyId) throw mediaVaultError('MEDIA_VAULT_KEY_ID_REQUIRED', 503);
  if (!(keyBytes instanceof Uint8Array) || keyBytes.byteLength !== KEY_BYTES) {
    throw mediaVaultError('MEDIA_VAULT_KEY_MUST_BE_32_BYTES', 503);
  }

  let imported;
  async function key() {
    imported ||= importKey(keyBytes);
    return imported;
  }

  return Object.freeze({
    schema:MEDIA_VAULT_SCHEMA,
    algorithm:MEDIA_VAULT_ALGORITHM,
    key_id:normalizedKeyId,

    async seal(bytesInput, aad) {
      const bytes = bytesInput instanceof Uint8Array ? bytesInput : new Uint8Array(bytesInput || []);
      if (!aad || typeof aad !== 'object' || Array.isArray(aad)) {
        throw mediaVaultError('MEDIA_VAULT_AAD_REQUIRED');
      }
      const iv = randomBytes(IV_BYTES);
      if (!(iv instanceof Uint8Array) || iv.byteLength !== IV_BYTES) {
        throw mediaVaultError('MEDIA_VAULT_IV_INVALID');
      }
      const encrypted = await crypto.subtle.encrypt({
        name:'AES-GCM',
        iv,
        additionalData:aadBytes(aad),
        tagLength:128,
      }, await key(), bytes);
      const ciphertext = new Uint8Array(encrypted);
      return {
        ciphertext,
        metadata:{
          mediaSchema:MEDIA_VAULT_SCHEMA,
          mediaAlgorithm:MEDIA_VAULT_ALGORITHM,
          mediaKeyId:normalizedKeyId,
          mediaIvB64:bytesToBase64(iv),
          plaintextSha256:await sha256Hex(bytes),
          ciphertextSha256:await sha256Hex(ciphertext),
        },
      };
    },

    async open({ ciphertext:input, metadata, aad } = {}) {
      const ciphertext = input instanceof Uint8Array ? input : new Uint8Array(input || []);
      if (clean(metadata?.mediaSchema, 80) !== MEDIA_VAULT_SCHEMA) throw mediaVaultError('MEDIA_VAULT_SCHEMA_INVALID', 409);
      if (clean(metadata?.mediaAlgorithm, 80) !== MEDIA_VAULT_ALGORITHM) throw mediaVaultError('MEDIA_VAULT_ALGORITHM_INVALID', 409);
      if (clean(metadata?.mediaKeyId, 200) !== normalizedKeyId) throw mediaVaultError('MEDIA_VAULT_KEY_ID_MISMATCH', 409);
      if (!HASH_RE.test(clean(metadata?.plaintextSha256, 64))) throw mediaVaultError('MEDIA_VAULT_PLAINTEXT_HASH_INVALID', 409);
      if (!HASH_RE.test(clean(metadata?.ciphertextSha256, 64))) throw mediaVaultError('MEDIA_VAULT_CIPHERTEXT_HASH_INVALID', 409);
      const actualCipherHash = await sha256Hex(ciphertext);
      if (actualCipherHash !== clean(metadata.ciphertextSha256, 64).toLowerCase()) {
        throw mediaVaultError('MEDIA_VAULT_CIPHERTEXT_INTEGRITY_MISMATCH', 409);
      }
      const iv = base64ToBytes(metadata.mediaIvB64);
      if (iv.byteLength !== IV_BYTES) throw mediaVaultError('MEDIA_VAULT_IV_INVALID', 409);
      let plaintext;
      try {
        plaintext = new Uint8Array(await crypto.subtle.decrypt({
          name:'AES-GCM',
          iv,
          additionalData:aadBytes(aad),
          tagLength:128,
        }, await key(), ciphertext));
      } catch {
        throw mediaVaultError('MEDIA_VAULT_DECRYPTION_FAILED', 409);
      }
      const actualPlainHash = await sha256Hex(plaintext);
      if (actualPlainHash !== clean(metadata.plaintextSha256, 64).toLowerCase()) {
        throw mediaVaultError('MEDIA_VAULT_PLAINTEXT_INTEGRITY_MISMATCH', 409);
      }
      return plaintext;
    },
  });
}

export function createEnvMediaVaultCodec(env = {}) {
  const keyId = clean(env.MEL_MEDIA_ENCRYPTION_KEY_ID, 200);
  const encoded = clean(env.MEL_MEDIA_ENCRYPTION_KEY_B64, 1000);
  if (!keyId) throw mediaVaultError('MEDIA_VAULT_KEY_ID_REQUIRED', 503);
  if (!encoded) throw mediaVaultError('MEDIA_VAULT_KEY_REQUIRED', 503);
  return createMediaVaultCodec({
    keyId,
    keyBytes:decodeMediaVaultKey(encoded),
  });
}

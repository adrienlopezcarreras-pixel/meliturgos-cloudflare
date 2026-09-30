import { DomainError, requireValue } from '../core/contracts.js';

export const OAUTH_VAULT_SCHEMA = 'MEL_OAUTH_VAULT_V1';
export const OAUTH_VAULT_ALGORITHM = 'AES-GCM-256';

const KEY_BYTES = 32;
const IV_BYTES = 12;

function vaultError(code, status = 400) {
  return new DomainError(code, status);
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

function base64ToBytes(value, code = 'OAUTH_VAULT_BASE64_INVALID') {
  try {
    const binary = atob(String(value || ''));
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  } catch {
    throw vaultError(code);
  }
}

async function sha256Hex(value) {
  const bytes = value instanceof Uint8Array ? value : new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function importKey(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== KEY_BYTES) {
    throw vaultError('OAUTH_VAULT_KEY_MUST_BE_32_BYTES', 503);
  }
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function aadBytes(aad) {
  return new TextEncoder().encode(JSON.stringify(stable(aad)));
}

export function decodeOAuthVaultKey(value) {
  const bytes = base64ToBytes(value, 'OAUTH_VAULT_KEY_BASE64_INVALID');
  if (bytes.byteLength !== KEY_BYTES) throw vaultError('OAUTH_VAULT_KEY_MUST_BE_32_BYTES', 503);
  return bytes;
}

export function createOAuthVaultCodec({
  keyBytes,
  keyId,
  randomBytes = size => crypto.getRandomValues(new Uint8Array(size)),
} = {}) {
  const normalizedKeyId = clean(keyId, 200);
  if (!normalizedKeyId) throw vaultError('OAUTH_VAULT_KEY_ID_REQUIRED', 503);
  if (!(keyBytes instanceof Uint8Array) || keyBytes.byteLength !== KEY_BYTES) {
    throw vaultError('OAUTH_VAULT_KEY_MUST_BE_32_BYTES', 503);
  }

  let imported;
  async function key() {
    imported ||= importKey(keyBytes);
    return imported;
  }

  return Object.freeze({
    key_id: normalizedKeyId,
    algorithm: OAUTH_VAULT_ALGORITHM,

    async seal(value, aad) {
      requireValue(value && typeof value === 'object' && !Array.isArray(value), 'OAUTH_VAULT_VALUE_REQUIRED', 400);
      requireValue(aad && typeof aad === 'object' && !Array.isArray(aad), 'OAUTH_VAULT_AAD_REQUIRED', 400);
      const iv = randomBytes(IV_BYTES);
      if (!(iv instanceof Uint8Array) || iv.byteLength !== IV_BYTES) throw vaultError('OAUTH_VAULT_IV_INVALID');
      const plaintext = new TextEncoder().encode(JSON.stringify(value));
      const encrypted = await crypto.subtle.encrypt({
        name: 'AES-GCM',
        iv,
        additionalData: aadBytes(aad),
        tagLength: 128,
      }, await key(), plaintext);
      const ciphertext = new Uint8Array(encrypted);
      return {
        schema: OAUTH_VAULT_SCHEMA,
        algorithm: OAUTH_VAULT_ALGORITHM,
        key_id: normalizedKeyId,
        iv_b64: bytesToBase64(iv),
        ciphertext_b64: bytesToBase64(ciphertext),
        ciphertext_sha256: await sha256Hex(ciphertext),
        aad: structuredClone(aad),
      };
    },

    async open(envelope, expectedAad) {
      requireValue(envelope?.schema === OAUTH_VAULT_SCHEMA, 'OAUTH_VAULT_SCHEMA_INVALID', 409);
      requireValue(envelope?.algorithm === OAUTH_VAULT_ALGORITHM, 'OAUTH_VAULT_ALGORITHM_INVALID', 409);
      requireValue(envelope?.key_id === normalizedKeyId, 'OAUTH_VAULT_KEY_ID_MISMATCH', 409);
      requireValue(
        JSON.stringify(stable(envelope?.aad || {})) === JSON.stringify(stable(expectedAad || {})),
        'OAUTH_VAULT_AAD_MISMATCH',
        409,
      );
      const iv = base64ToBytes(envelope.iv_b64);
      if (iv.byteLength !== IV_BYTES) throw vaultError('OAUTH_VAULT_IV_INVALID', 409);
      const ciphertext = base64ToBytes(envelope.ciphertext_b64);
      const checksum = await sha256Hex(ciphertext);
      requireValue(checksum === clean(envelope.ciphertext_sha256, 64), 'OAUTH_VAULT_CIPHERTEXT_INTEGRITY_MISMATCH', 409);
      let decrypted;
      try {
        decrypted = await crypto.subtle.decrypt({
          name: 'AES-GCM',
          iv,
          additionalData: aadBytes(expectedAad),
          tagLength: 128,
        }, await key(), ciphertext);
      } catch {
        throw vaultError('OAUTH_VAULT_DECRYPTION_FAILED', 409);
      }
      try {
        const parsed = JSON.parse(new TextDecoder().decode(decrypted));
        requireValue(parsed && typeof parsed === 'object' && !Array.isArray(parsed), 'OAUTH_VAULT_JSON_INVALID', 409);
        return parsed;
      } catch (error) {
        if (error?.code) throw error;
        throw vaultError('OAUTH_VAULT_JSON_INVALID', 409);
      }
    },
  });
}

export function createEnvOAuthVaultCodec(env = {}) {
  const keyId = clean(env.MEL_OAUTH_ENCRYPTION_KEY_ID, 200);
  const encoded = clean(env.MEL_OAUTH_ENCRYPTION_KEY_B64, 1000);
  if (!keyId) throw vaultError('OAUTH_VAULT_KEY_ID_REQUIRED', 503);
  if (!encoded) throw vaultError('OAUTH_VAULT_KEY_REQUIRED', 503);
  return createOAuthVaultCodec({
    keyId,
    keyBytes: decodeOAuthVaultKey(encoded),
  });
}

function owner(value) {
  const normalized = clean(value, 200);
  requireValue(normalized, 'OAUTH_OWNER_REQUIRED', 401);
  return normalized;
}

function connector(value) {
  const normalized = clean(value, 160);
  requireValue(normalized, 'OAUTH_CONNECTOR_ID_REQUIRED', 400);
  return normalized;
}

export class D1OAuthVaults {
  constructor(db, { codec, now = () => Date.now() } = {}) {
    if (!db) throw vaultError('OAUTH_VAULT_DB_REQUIRED', 503);
    if (!codec || typeof codec.seal !== 'function' || typeof codec.open !== 'function') {
      throw vaultError('OAUTH_VAULT_CODEC_REQUIRED', 503);
    }
    this.db = db;
    this.codec = codec;
    this.now = now;
    this._ready = false;

    this.transactionVault = Object.freeze({
      put: input => this.putTransaction(input),
      take: input => this.takeTransaction(input),
    });
    this.tokenVault = Object.freeze({
      put: input => this.putToken(input),
      get: input => this.getToken(input),
      delete: input => this.deleteToken(input),
    });
  }

  async ready() {
    if (this._ready) return this;
    await this.db.prepare(`CREATE TABLE IF NOT EXISTS mel_oauth_transactions (
      owner TEXT NOT NULL,
      connector_id TEXT NOT NULL,
      state_sha256 TEXT NOT NULL,
      envelope_json TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(owner,connector_id,state_sha256)
    )`).run();
    await this.db.prepare(`CREATE TABLE IF NOT EXISTS mel_oauth_tokens (
      owner TEXT NOT NULL,
      connector_id TEXT NOT NULL,
      envelope_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(owner,connector_id)
    )`).run();
    this._ready = true;
    return this;
  }

  async putTransaction({ owner: ownerInput, connector_id: connectorInput, state, record }) {
    await this.ready();
    const normalizedOwner = owner(ownerInput);
    const connectorId = connector(connectorInput);
    const rawState = clean(state, 1000);
    requireValue(rawState, 'OAUTH_STATE_REQUIRED', 400);
    requireValue(record && typeof record === 'object', 'OAUTH_TRANSACTION_REQUIRED', 400);
    const stateHash = await sha256Hex(rawState);
    const aad = { kind: 'transaction', owner: normalizedOwner, connector_id: connectorId, state_sha256: stateHash };
    const envelope = await this.codec.seal(record, aad);
    const expiresAt = Number(record.expires_at);
    requireValue(Number.isFinite(expiresAt), 'OAUTH_TRANSACTION_EXPIRY_REQUIRED', 400);
    await this.db.prepare(`INSERT INTO mel_oauth_transactions(
      owner,connector_id,state_sha256,envelope_json,expires_at,created_at
    ) VALUES(?,?,?,?,?,?)
    ON CONFLICT(owner,connector_id,state_sha256) DO UPDATE SET
      envelope_json=excluded.envelope_json,
      expires_at=excluded.expires_at,
      created_at=excluded.created_at`).bind(
      normalizedOwner,
      connectorId,
      stateHash,
      JSON.stringify(envelope),
      expiresAt,
      this.now(),
    ).run();
  }

  async takeTransaction({ owner: ownerInput, connector_id: connectorInput, state }) {
    await this.ready();
    const normalizedOwner = owner(ownerInput);
    const connectorId = connector(connectorInput);
    const rawState = clean(state, 1000);
    requireValue(rawState, 'OAUTH_STATE_REQUIRED', 400);
    const stateHash = await sha256Hex(rawState);
    const row = await this.db.prepare(
      `DELETE FROM mel_oauth_transactions
       WHERE owner=? AND connector_id=? AND state_sha256=?
       RETURNING envelope_json,expires_at`
    ).bind(normalizedOwner, connectorId, stateHash).first();
    if (!row) return null;
    if (Number(row.expires_at) < this.now()) return null;
    let envelope;
    try { envelope = JSON.parse(row.envelope_json); }
    catch { throw vaultError('OAUTH_VAULT_ENVELOPE_INVALID', 500); }
    const aad = { kind: 'transaction', owner: normalizedOwner, connector_id: connectorId, state_sha256: stateHash };
    return this.codec.open(envelope, aad);
  }

  async putToken({ owner: ownerInput, connector_id: connectorInput, token_set }) {
    await this.ready();
    const normalizedOwner = owner(ownerInput);
    const connectorId = connector(connectorInput);
    requireValue(token_set && typeof token_set === 'object', 'OAUTH_TOKEN_SET_REQUIRED', 400);
    const aad = { kind: 'token', owner: normalizedOwner, connector_id: connectorId };
    const envelope = await this.codec.seal(token_set, aad);
    await this.db.prepare(`INSERT INTO mel_oauth_tokens(owner,connector_id,envelope_json,updated_at)
      VALUES(?,?,?,?)
      ON CONFLICT(owner,connector_id) DO UPDATE SET
        envelope_json=excluded.envelope_json,
        updated_at=excluded.updated_at`).bind(
      normalizedOwner,
      connectorId,
      JSON.stringify(envelope),
      this.now(),
    ).run();
  }

  async getToken({ owner: ownerInput, connector_id: connectorInput }) {
    await this.ready();
    const normalizedOwner = owner(ownerInput);
    const connectorId = connector(connectorInput);
    const row = await this.db.prepare(
      'SELECT envelope_json FROM mel_oauth_tokens WHERE owner=? AND connector_id=?'
    ).bind(normalizedOwner, connectorId).first();
    if (!row) return null;
    let envelope;
    try { envelope = JSON.parse(row.envelope_json); }
    catch { throw vaultError('OAUTH_VAULT_ENVELOPE_INVALID', 500); }
    const aad = { kind: 'token', owner: normalizedOwner, connector_id: connectorId };
    return this.codec.open(envelope, aad);
  }

  async deleteToken({ owner: ownerInput, connector_id: connectorInput }) {
    await this.ready();
    const normalizedOwner = owner(ownerInput);
    const connectorId = connector(connectorInput);
    const result = await this.db.prepare(
      'DELETE FROM mel_oauth_tokens WHERE owner=? AND connector_id=?'
    ).bind(normalizedOwner, connectorId).run();
    return Boolean(result?.meta?.changes);
  }

  accessTokenResolver() {
    return async (connectorId, context = {}) => {
      const normalizedOwner = owner(context.owner);
      const tokenSet = await this.getToken({ owner: normalizedOwner, connector_id: connectorId });
      return clean(tokenSet?.access_token, 20000);
    };
  }
}

export function createD1OAuthVaults(env = {}, options = {}) {
  if (!env?.DB) throw vaultError('OAUTH_VAULT_DB_REQUIRED', 503);
  return new D1OAuthVaults(env.DB, {
    codec: options.codec || createEnvOAuthVaultCodec(env),
    now: options.now,
  });
}

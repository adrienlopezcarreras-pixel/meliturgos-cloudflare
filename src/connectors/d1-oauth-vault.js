import { DomainError, requireValue } from '../core/contracts.js';

export const OAUTH_VAULT_SCHEMA = 'MEL_OAUTH_VAULT_V1';
export const OAUTH_VAULT_ALGORITHM = 'AES-GCM-256';

const KEY_BYTES = 32;
const IV_BYTES = 12;

function vaultError(code, status = 400) {
  return new DomainError(code, status);
}

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  }
  return btoa(binary);
}

function base64ToBytes(value, code = 'OAUTH_VAULT_BASE64_INVALID') {
  try {
    const binary = atob(String(value || ''));
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  } catch {
    throw vaultError(code, 500);
  }
}

export function decodeOAuthVaultKey(value) {
  const bytes = base64ToBytes(value, 'OAUTH_VAULT_KEY_BASE64_INVALID');
  if (bytes.byteLength !== KEY_BYTES) throw vaultError('OAUTH_VAULT_KEY_MUST_BE_32_BYTES', 500);
  return bytes;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value ?? ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function importKey(keyBytes) {
  if (!(keyBytes instanceof Uint8Array) || keyBytes.byteLength !== KEY_BYTES) {
    throw vaultError('OAUTH_VAULT_KEY_MUST_BE_32_BYTES', 500);
  }
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt']);
}

function aadText({ keyId, owner, connectorId, purpose }) {
  return JSON.stringify({
    schema: OAUTH_VAULT_SCHEMA,
    algorithm: OAUTH_VAULT_ALGORITHM,
    key_id: clean(keyId, 200),
    owner: clean(owner, 300),
    connector_id: clean(connectorId, 160),
    purpose: clean(purpose, 80),
  });
}

export function createOAuthVaultCodec({
  keyBytes,
  keyId,
  randomBytes = size => crypto.getRandomValues(new Uint8Array(size)),
} = {}) {
  const normalizedKeyId = clean(keyId, 200);
  if (!normalizedKeyId) throw vaultError('OAUTH_VAULT_KEY_ID_REQUIRED', 500);
  if (!(keyBytes instanceof Uint8Array) || keyBytes.byteLength !== KEY_BYTES) {
    throw vaultError('OAUTH_VAULT_KEY_MUST_BE_32_BYTES', 500);
  }
  if (typeof randomBytes !== 'function') throw vaultError('OAUTH_VAULT_RANDOM_SOURCE_REQUIRED', 500);

  let imported;
  const key = async () => (imported ||= importKey(keyBytes));

  return Object.freeze({
    schema: OAUTH_VAULT_SCHEMA,
    algorithm: OAUTH_VAULT_ALGORITHM,
    key_id: normalizedKeyId,

    async seal(value, identity = {}) {
      const owner = clean(identity.owner, 300);
      const connectorId = clean(identity.connector_id, 160);
      const purpose = clean(identity.purpose, 80);
      requireValue(owner, 'OAUTH_VAULT_OWNER_REQUIRED', 401);
      requireValue(connectorId, 'OAUTH_VAULT_CONNECTOR_REQUIRED', 400);
      requireValue(purpose, 'OAUTH_VAULT_PURPOSE_REQUIRED', 500);

      const plaintext = new TextEncoder().encode(JSON.stringify(value));
      const iv = randomBytes(IV_BYTES);
      if (!(iv instanceof Uint8Array) || iv.byteLength !== IV_BYTES) throw vaultError('OAUTH_VAULT_IV_INVALID', 500);
      const aad = new TextEncoder().encode(aadText({
        keyId: normalizedKeyId,
        owner,
        connectorId,
        purpose,
      }));
      const encrypted = await crypto.subtle.encrypt({
        name: 'AES-GCM',
        iv,
        additionalData: aad,
        tagLength: 128,
      }, await key(), plaintext);
      return Object.freeze({
        schema: OAUTH_VAULT_SCHEMA,
        algorithm: OAUTH_VAULT_ALGORITHM,
        key_id: normalizedKeyId,
        iv_b64: bytesToBase64(iv),
        ciphertext_b64: bytesToBase64(new Uint8Array(encrypted)),
      });
    },

    async open(envelope, identity = {}) {
      if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) throw vaultError('OAUTH_VAULT_ENVELOPE_INVALID', 500);
      if (envelope.schema !== OAUTH_VAULT_SCHEMA) throw vaultError('OAUTH_VAULT_SCHEMA_INVALID', 500);
      if (envelope.algorithm !== OAUTH_VAULT_ALGORITHM) throw vaultError('OAUTH_VAULT_ALGORITHM_INVALID', 500);
      if (clean(envelope.key_id, 200) !== normalizedKeyId) throw vaultError('OAUTH_VAULT_KEY_ID_MISMATCH', 500);

      const owner = clean(identity.owner, 300);
      const connectorId = clean(identity.connector_id, 160);
      const purpose = clean(identity.purpose, 80);
      requireValue(owner, 'OAUTH_VAULT_OWNER_REQUIRED', 401);
      requireValue(connectorId, 'OAUTH_VAULT_CONNECTOR_REQUIRED', 400);
      requireValue(purpose, 'OAUTH_VAULT_PURPOSE_REQUIRED', 500);

      const iv = base64ToBytes(envelope.iv_b64);
      const ciphertext = base64ToBytes(envelope.ciphertext_b64);
      if (iv.byteLength !== IV_BYTES || ciphertext.byteLength < 16) throw vaultError('OAUTH_VAULT_ENVELOPE_INVALID', 500);
      const aad = new TextEncoder().encode(aadText({
        keyId: normalizedKeyId,
        owner,
        connectorId,
        purpose,
      }));

      let decrypted;
      try {
        decrypted = await crypto.subtle.decrypt({
          name: 'AES-GCM',
          iv,
          additionalData: aad,
          tagLength: 128,
        }, await key(), ciphertext);
      } catch {
        throw vaultError('OAUTH_VAULT_DECRYPTION_FAILED', 409);
      }

      try {
        const parsed = JSON.parse(new TextDecoder().decode(new Uint8Array(decrypted)));
        requireValue(parsed && typeof parsed === 'object' && !Array.isArray(parsed), 'OAUTH_VAULT_JSON_INVALID', 500);
        return parsed;
      } catch (error) {
        if (error?.code) throw error;
        throw vaultError('OAUTH_VAULT_JSON_INVALID', 500);
      }
    },
  });
}

export function createEnvOAuthVaultCodec(env = {}) {
  const encoded = clean(env.MEL_OAUTH_TOKEN_KEY_B64, 2000);
  const keyId = clean(env.MEL_OAUTH_TOKEN_KEY_ID, 200);
  if (!encoded) throw vaultError('OAUTH_VAULT_KEY_REQUIRED', 503);
  if (!keyId) throw vaultError('OAUTH_VAULT_KEY_ID_REQUIRED', 503);
  return createOAuthVaultCodec({
    keyBytes: decodeOAuthVaultKey(encoded),
    keyId,
  });
}

async function ensureTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS oauth_transactions (
    owner TEXT NOT NULL,
    connector_id TEXT NOT NULL,
    state_hash TEXT NOT NULL,
    envelope_json TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(owner,connector_id,state_hash)
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_oauth_transactions_expiry
    ON oauth_transactions(expires_at)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS oauth_tokens (
    owner TEXT NOT NULL,
    connector_id TEXT NOT NULL,
    envelope_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(owner,connector_id)
  )`).run();
}

function envelopeJson(value) {
  return JSON.stringify(value);
}

function parseEnvelope(value) {
  try {
    const parsed = JSON.parse(String(value || '{}'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw vaultError('OAUTH_VAULT_STORED_ENVELOPE_INVALID', 500);
  }
}

export class D1OAuthTransactionVault {
  constructor(db, codec, { now = () => Date.now() } = {}) {
    if (!db?.prepare) throw vaultError('OAUTH_VAULT_DB_REQUIRED', 503);
    if (!codec?.seal || !codec?.open) throw vaultError('OAUTH_VAULT_CODEC_REQUIRED', 503);
    this.db = db;
    this.codec = codec;
    this.now = now;
    this.readyPromise = null;
  }

  ready() {
    return this.readyPromise ||= ensureTables(this.db).then(() => this);
  }

  async put({ owner, connector_id, state, record }) {
    await this.ready();
    const normalizedOwner = clean(owner, 300);
    const connectorId = clean(connector_id, 160);
    const normalizedState = clean(state, 500);
    requireValue(normalizedOwner, 'OAUTH_OWNER_REQUIRED', 401);
    requireValue(connectorId, 'OAUTH_CONNECTOR_ID_REQUIRED', 400);
    requireValue(normalizedState, 'OAUTH_STATE_REQUIRED', 400);
    requireValue(record && typeof record === 'object' && !Array.isArray(record), 'OAUTH_TRANSACTION_RECORD_REQUIRED', 400);
    const expiresAt = Number(record.expires_at);
    requireValue(Number.isFinite(expiresAt), 'OAUTH_TRANSACTION_EXPIRY_REQUIRED', 400);

    const stateHash = await sha256Hex(normalizedState);
    const envelope = await this.codec.seal(record, {
      owner: normalizedOwner,
      connector_id: connectorId,
      purpose: 'transaction',
    });
    const at = this.now();
    await this.db.prepare('DELETE FROM oauth_transactions WHERE expires_at<?').bind(at).run();
    await this.db.prepare(`INSERT INTO oauth_transactions(
      owner,connector_id,state_hash,envelope_json,expires_at,created_at
    ) VALUES(?,?,?,?,?,?)`).bind(
      normalizedOwner,
      connectorId,
      stateHash,
      envelopeJson(envelope),
      expiresAt,
      at,
    ).run();
    return { stored: true, expires_at: expiresAt };
  }

  async resolveConnector({ owner, state }) {
    await this.ready();
    const normalizedOwner = clean(owner, 300);
    const normalizedState = clean(state, 500);
    requireValue(normalizedOwner, 'OAUTH_OWNER_REQUIRED', 401);
    requireValue(normalizedState, 'OAUTH_STATE_REQUIRED', 400);
    const stateHash = await sha256Hex(normalizedState);
    const row = await this.db.prepare(`SELECT connector_id FROM oauth_transactions
      WHERE owner=? AND state_hash=? AND expires_at>=?
      ORDER BY created_at DESC LIMIT 1`).bind(
      normalizedOwner,
      stateHash,
      this.now(),
    ).first();
    return row?.connector_id ? clean(row.connector_id, 160) : null;
  }

  async take({ owner, connector_id, state }) {
    await this.ready();
    const normalizedOwner = clean(owner, 300);
    const connectorId = clean(connector_id, 160);
    const normalizedState = clean(state, 500);
    requireValue(normalizedOwner, 'OAUTH_OWNER_REQUIRED', 401);
    requireValue(connectorId, 'OAUTH_CONNECTOR_ID_REQUIRED', 400);
    requireValue(normalizedState, 'OAUTH_STATE_REQUIRED', 400);
    const stateHash = await sha256Hex(normalizedState);

    const row = await this.db.prepare(`DELETE FROM oauth_transactions
      WHERE owner=? AND connector_id=? AND state_hash=?
      RETURNING envelope_json,expires_at`).bind(
      normalizedOwner,
      connectorId,
      stateHash,
    ).first();
    if (!row) return null;
    if (Number(row.expires_at) < this.now()) return null;
    return this.codec.open(parseEnvelope(row.envelope_json), {
      owner: normalizedOwner,
      connector_id: connectorId,
      purpose: 'transaction',
    });
  }
}

export class D1OAuthTokenVault {
  constructor(db, codec, { now = () => Date.now() } = {}) {
    if (!db?.prepare) throw vaultError('OAUTH_VAULT_DB_REQUIRED', 503);
    if (!codec?.seal || !codec?.open) throw vaultError('OAUTH_VAULT_CODEC_REQUIRED', 503);
    this.db = db;
    this.codec = codec;
    this.now = now;
    this.readyPromise = null;
  }

  ready() {
    return this.readyPromise ||= ensureTables(this.db).then(() => this);
  }

  async put({ owner, connector_id, token_set }) {
    await this.ready();
    const normalizedOwner = clean(owner, 300);
    const connectorId = clean(connector_id, 160);
    requireValue(normalizedOwner, 'OAUTH_OWNER_REQUIRED', 401);
    requireValue(connectorId, 'OAUTH_CONNECTOR_ID_REQUIRED', 400);
    requireValue(token_set && typeof token_set === 'object' && !Array.isArray(token_set), 'OAUTH_TOKEN_SET_REQUIRED', 400);
    const envelope = await this.codec.seal(token_set, {
      owner: normalizedOwner,
      connector_id: connectorId,
      purpose: 'token',
    });
    const at = this.now();
    await this.db.prepare(`INSERT INTO oauth_tokens(
      owner,connector_id,envelope_json,created_at,updated_at
    ) VALUES(?,?,?,?,?)
    ON CONFLICT(owner,connector_id) DO UPDATE SET
      envelope_json=excluded.envelope_json,
      updated_at=excluded.updated_at`).bind(
      normalizedOwner,
      connectorId,
      envelopeJson(envelope),
      at,
      at,
    ).run();
    return { stored: true, connector_id: connectorId, updated_at: at };
  }

  async get({ owner, connector_id }) {
    await this.ready();
    const normalizedOwner = clean(owner, 300);
    const connectorId = clean(connector_id, 160);
    requireValue(normalizedOwner, 'OAUTH_OWNER_REQUIRED', 401);
    requireValue(connectorId, 'OAUTH_CONNECTOR_ID_REQUIRED', 400);
    const row = await this.db.prepare(
      'SELECT envelope_json FROM oauth_tokens WHERE owner=? AND connector_id=?'
    ).bind(normalizedOwner, connectorId).first();
    if (!row) return null;
    return this.codec.open(parseEnvelope(row.envelope_json), {
      owner: normalizedOwner,
      connector_id: connectorId,
      purpose: 'token',
    });
  }

  async delete({ owner, connector_id }) {
    await this.ready();
    const normalizedOwner = clean(owner, 300);
    const connectorId = clean(connector_id, 160);
    requireValue(normalizedOwner, 'OAUTH_OWNER_REQUIRED', 401);
    requireValue(connectorId, 'OAUTH_CONNECTOR_ID_REQUIRED', 400);
    const result = await this.db.prepare(
      'DELETE FROM oauth_tokens WHERE owner=? AND connector_id=?'
    ).bind(normalizedOwner, connectorId).run();
    return Boolean(result?.meta?.changes);
  }
}

export function createD1OAuthVaults(env = {}, options = {}) {
  if (!env?.DB?.prepare) throw vaultError('OAUTH_VAULT_DB_REQUIRED', 503);
  const codec = options.codec || createEnvOAuthVaultCodec(env);
  return Object.freeze({
    codec,
    transactionVault: new D1OAuthTransactionVault(env.DB, codec, options),
    tokenVault: new D1OAuthTokenVault(env.DB, codec, options),
  });
}

export function createOAuthAccessTokenResolver({
  tokenVault,
  oauth = null,
  now = () => Date.now(),
  refreshSkewMs = 60_000,
} = {}) {
  if (!tokenVault?.get) throw vaultError('OAUTH_TOKEN_VAULT_REQUIRED', 503);
  return async (connectorId, context = {}) => {
    const owner = clean(context.owner, 300);
    requireValue(owner, 'OAUTH_OWNER_REQUIRED', 401);
    let tokenSet = await tokenVault.get({ owner, connector_id: connectorId });
    if (!tokenSet?.access_token) return '';

    const expiresAt = Number(tokenSet.expires_at);
    const expiring = Number.isFinite(expiresAt) && expiresAt <= now() + refreshSkewMs;
    if (expiring && tokenSet.refresh_token && oauth?.refresh) {
      await oauth.refresh({ connector_id: connectorId }, context);
      tokenSet = await tokenVault.get({ owner, connector_id: connectorId });
    }
    return clean(tokenSet?.access_token, 10000);
  };
}

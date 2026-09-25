import { DomainError, requireValue } from '../core/contracts.js';

const SESSION_KIND = 'session';
const CREDENTIAL_KIND = 'credential';

function changes(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  try {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    throw new DomainError('OAUTH_VAULT_KEY_INVALID', 500);
  }
}

function keyBytes(value) {
  if (value instanceof Uint8Array) {
    requireValue(value.length === 32, 'OAUTH_VAULT_KEY_INVALID', 500);
    return new Uint8Array(value);
  }
  const raw = String(value || '').trim();
  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Uint8Array.from(raw.match(/.{2}/g).map(byte => Number.parseInt(byte, 16)));
  }
  const decoded = base64ToBytes(raw);
  requireValue(decoded.length === 32, 'OAUTH_VAULT_KEY_INVALID', 500);
  return decoded;
}

function vaultId({ connector_id, owner }) {
  const connectorId = String(connector_id || '').trim();
  const ownerId = String(owner || '').trim();
  requireValue(connectorId && ownerId, 'OAUTH_VAULT_IDENTITY_REQUIRED', 400);
  return `${ownerId}::${connectorId}`;
}

function aad(kind, id) {
  return new TextEncoder().encode(`mel-connector-oauth-v1:${kind}:${id}`);
}

export function createEncryptedD1OAuthStores(db, { key, now = () => Date.now() } = {}) {
  requireValue(db && typeof db.prepare === 'function', 'OAUTH_VAULT_D1_REQUIRED', 500);
  const rawKey = keyBytes(key);
  const cryptoKey = crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  let ready = null;

  async function init() {
    if (!ready) {
      ready = db.prepare(`CREATE TABLE IF NOT EXISTS connector_oauth_vault (
        kind TEXT NOT NULL,
        id TEXT NOT NULL,
        iv_b64 TEXT NOT NULL,
        ciphertext_b64 TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        consumed_at INTEGER,
        PRIMARY KEY(kind,id)
      )`).run();
    }
    await ready;
  }

  async function encrypt(kind, id, record) {
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    const plaintext = new TextEncoder().encode(JSON.stringify(record));
    const ciphertext = await crypto.subtle.encrypt({
      name: 'AES-GCM',
      iv,
      additionalData: aad(kind, id),
    }, await cryptoKey, plaintext);
    return {
      iv_b64: bytesToBase64(iv),
      ciphertext_b64: bytesToBase64(new Uint8Array(ciphertext)),
    };
  }

  async function decrypt(kind, id, row) {
    try {
      const plaintext = await crypto.subtle.decrypt({
        name: 'AES-GCM',
        iv: base64ToBytes(row.iv_b64),
        additionalData: aad(kind, id),
      }, await cryptoKey, base64ToBytes(row.ciphertext_b64));
      const parsed = JSON.parse(new TextDecoder().decode(plaintext));
      requireValue(parsed && typeof parsed === 'object' && !Array.isArray(parsed), 'OAUTH_VAULT_RECORD_CORRUPT', 500);
      return parsed;
    } catch (error) {
      if (error?.code === 'OAUTH_VAULT_RECORD_CORRUPT') throw error;
      throw new DomainError('OAUTH_VAULT_DECRYPT_FAILED', 500);
    }
  }

  async function read(kind, id, { unconsumed = false } = {}) {
    await init();
    const sql = unconsumed
      ? 'SELECT * FROM connector_oauth_vault WHERE kind=? AND id=? AND consumed_at IS NULL'
      : 'SELECT * FROM connector_oauth_vault WHERE kind=? AND id=?';
    return db.prepare(sql).bind(kind, id).first();
  }

  const stateStore = Object.freeze({
    async putSession(state, record) {
      await init();
      const id = String(state || '').trim();
      requireValue(id, 'OAUTH_STATE_REQUIRED', 400);
      const encrypted = await encrypt(SESSION_KIND, id, record);
      try {
        await db.prepare(`INSERT INTO connector_oauth_vault(
          kind,id,iv_b64,ciphertext_b64,updated_at,consumed_at
        ) VALUES(?,?,?,?,?,NULL)`)
          .bind(SESSION_KIND, id, encrypted.iv_b64, encrypted.ciphertext_b64, now())
          .run();
      } catch {
        throw new DomainError('OAUTH_STATE_COLLISION', 409);
      }
      return true;
    },

    async consumeSession(state) {
      await init();
      const id = String(state || '').trim();
      if (!id) return null;
      const row = await read(SESSION_KIND, id, { unconsumed: true });
      if (!row) return null;
      const claimedAt = now();
      const claimed = await db.prepare(`UPDATE connector_oauth_vault
        SET consumed_at=?,updated_at=?
        WHERE kind=? AND id=? AND consumed_at IS NULL`)
        .bind(claimedAt, claimedAt, SESSION_KIND, id)
        .run();
      if (changes(claimed) !== 1) return null;
      const record = await decrypt(SESSION_KIND, id, row);
      await db.prepare('DELETE FROM connector_oauth_vault WHERE kind=? AND id=?')
        .bind(SESSION_KIND, id)
        .run();
      return record;
    },
  });

  const credentialStore = Object.freeze({
    async putCredentials(identity, record) {
      await init();
      const id = vaultId(identity);
      const encrypted = await encrypt(CREDENTIAL_KIND, id, record);
      await db.prepare(`INSERT INTO connector_oauth_vault(
        kind,id,iv_b64,ciphertext_b64,updated_at,consumed_at
      ) VALUES(?,?,?,?,?,NULL)
      ON CONFLICT(kind,id) DO UPDATE SET
        iv_b64=excluded.iv_b64,
        ciphertext_b64=excluded.ciphertext_b64,
        updated_at=excluded.updated_at,
        consumed_at=NULL`)
        .bind(CREDENTIAL_KIND, id, encrypted.iv_b64, encrypted.ciphertext_b64, now())
        .run();
      return true;
    },

    async getCredentials(identity) {
      const id = vaultId(identity);
      const row = await read(CREDENTIAL_KIND, id);
      return row ? decrypt(CREDENTIAL_KIND, id, row) : null;
    },

    async deleteCredentials(identity) {
      await init();
      const id = vaultId(identity);
      const result = await db.prepare('DELETE FROM connector_oauth_vault WHERE kind=? AND id=?')
        .bind(CREDENTIAL_KIND, id)
        .run();
      return changes(result) === 1;
    },
  });

  return Object.freeze({ stateStore, credentialStore });
}

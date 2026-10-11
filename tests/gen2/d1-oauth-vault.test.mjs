import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createOAuthVaultCodec,
  createEnvOAuthVaultCodec,
  D1OAuthVaults,
} from '../../src/connectors/d1-oauth-vault.js';

function key(seed = 1) {
  return Uint8Array.from({ length: 32 }, (_, i) => (seed + i) & 0xff);
}

function iv() {
  return Uint8Array.from({ length: 12 }, (_, i) => i + 1);
}

function compact(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

class Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = compact(sql);
    this.args = [];
  }
  bind(...args) {
    this.args = args;
    return this;
  }
  async run() {
    const sql = this.sql;
    if (sql.startsWith('CREATE TABLE')) return { success: true, meta: { changes: 0 } };

    if (sql.startsWith('INSERT INTO mel_oauth_transactions')) {
      const [owner, connector_id, state_sha256, envelope_json, expires_at, created_at] = this.args;
      this.db.transactions.set(owner + '::' + connector_id + '::' + state_sha256, {
        owner, connector_id, state_sha256, envelope_json, expires_at, created_at,
      });
      return { success: true, meta: { changes: 1 } };
    }

    if (sql.startsWith('INSERT INTO mel_oauth_tokens')) {
      const [owner, connector_id, envelope_json, updated_at] = this.args;
      this.db.tokens.set(owner + '::' + connector_id, { owner, connector_id, envelope_json, updated_at });
      return { success: true, meta: { changes: 1 } };
    }

    if (sql === 'DELETE FROM mel_oauth_tokens WHERE owner=? AND connector_id=?') {
      const changed = this.db.tokens.delete(this.args[0] + '::' + this.args[1]);
      return { success: true, meta: { changes: changed ? 1 : 0 } };
    }

    throw new Error('UNEXPECTED_SQL_RUN:' + sql);
  }
  async first() {
    const sql = this.sql;

    if (sql.startsWith('DELETE FROM mel_oauth_transactions WHERE owner=? AND connector_id=? AND state_sha256=? RETURNING')) {
      const key = this.args[0] + '::' + this.args[1] + '::' + this.args[2];
      const row = this.db.transactions.get(key);
      if (!row) return null;
      this.db.transactions.delete(key);
      return { envelope_json: row.envelope_json, expires_at: row.expires_at };
    }

    if (sql === 'SELECT envelope_json FROM mel_oauth_tokens WHERE owner=? AND connector_id=?') {
      const row = this.db.tokens.get(this.args[0] + '::' + this.args[1]);
      return row ? { envelope_json: row.envelope_json } : null;
    }

    throw new Error('UNEXPECTED_SQL_FIRST:' + sql);
  }
}

class FakeD1 {
  constructor() {
    this.transactions = new Map();
    this.tokens = new Map();
  }
  prepare(sql) {
    return new Statement(this, sql);
  }
}

function codec(seed = 1) {
  return createOAuthVaultCodec({
    keyBytes: key(seed),
    keyId: 'oauth-key-2026-09',
    randomBytes: iv,
  });
}

test('OAuth D1 vault stores token and PKCE transaction only as AES-GCM ciphertext', async () => {
  const db = new FakeD1();
  const vault = new D1OAuthVaults(db, { codec: codec(), now: () => 1_000 });

  await vault.putTransaction({
    owner: 'adrien',
    connector_id: 'gmail',
    state: 'state-secret-value',
    record: {
      owner: 'adrien',
      connector_id: 'gmail',
      state: 'state-secret-value',
      code_verifier: 'pkce-verifier-secret',
      requested_scopes: ['gmail.readonly'],
      expires_at: 50_000,
    },
  });

  await vault.putToken({
    owner: 'adrien',
    connector_id: 'gmail',
    token_set: {
      access_token: 'access-token-secret',
      refresh_token: 'refresh-token-secret',
      token_type: 'Bearer',
      scopes: ['gmail.readonly'],
      expires_at: 99_000,
    },
  });

  const raw = JSON.stringify({
    transactions: [...db.transactions.values()],
    tokens: [...db.tokens.values()],
  });
  assert.doesNotMatch(raw, /access-token-secret/);
  assert.doesNotMatch(raw, /refresh-token-secret/);
  assert.doesNotMatch(raw, /pkce-verifier-secret/);
  assert.doesNotMatch(raw, /state-secret-value/);
  assert.match(raw, /MEL_OAUTH_VAULT_V1/);
  assert.match(raw, /AES-GCM-256/);
});

test('PKCE transaction is owner scoped, state-hashed and consumed exactly once', async () => {
  const db = new FakeD1();
  const vault = new D1OAuthVaults(db, { codec: codec(), now: () => 1_000 });

  const record = {
    owner: 'adrien',
    connector_id: 'gmail',
    state: 'one-time-state',
    code_verifier: 'verifier',
    requested_scopes: ['scope-a'],
    expires_at: 50_000,
  };
  await vault.putTransaction({
    owner: 'adrien',
    connector_id: 'gmail',
    state: 'one-time-state',
    record,
  });

  assert.equal([...db.transactions.values()][0].state_sha256.length, 64);
  assert.equal(await vault.takeTransaction({
    owner: 'other',
    connector_id: 'gmail',
    state: 'one-time-state',
  }), null);

  const first = await vault.takeTransaction({
    owner: 'adrien',
    connector_id: 'gmail',
    state: 'one-time-state',
  });
  assert.deepEqual(first, record);

  const replay = await vault.takeTransaction({
    owner: 'adrien',
    connector_id: 'gmail',
    state: 'one-time-state',
  });
  assert.equal(replay, null);
});

test('expired PKCE transaction is atomically consumed and cannot be replayed', async () => {
  let now = 10_000;
  const db = new FakeD1();
  const vault = new D1OAuthVaults(db, { codec: codec(), now: () => now });

  await vault.putTransaction({
    owner: 'adrien',
    connector_id: 'google-calendar',
    state: 'expired-state',
    record: {
      owner: 'adrien',
      connector_id: 'google-calendar',
      state: 'expired-state',
      code_verifier: 'verifier',
      expires_at: 10_500,
    },
  });

  now = 10_501;
  assert.equal(await vault.takeTransaction({
    owner: 'adrien',
    connector_id: 'google-calendar',
    state: 'expired-state',
  }), null);
  assert.equal(db.transactions.size, 0);
});

test('token vault isolates owners and server resolver returns only the decrypted access token', async () => {
  const db = new FakeD1();
  const vault = new D1OAuthVaults(db, { codec: codec() });

  await vault.putToken({
    owner: 'adrien',
    connector_id: 'gmail',
    token_set: {
      access_token: 'adrien-access',
      refresh_token: 'adrien-refresh',
      token_type: 'Bearer',
      scopes: ['gmail.readonly'],
    },
  });
  await vault.putToken({
    owner: 'other',
    connector_id: 'gmail',
    token_set: {
      access_token: 'other-access',
      refresh_token: 'other-refresh',
      token_type: 'Bearer',
      scopes: ['gmail.readonly'],
    },
  });

  const resolve = vault.accessTokenResolver();
  assert.equal(await resolve('gmail', { owner: 'adrien' }), 'adrien-access');
  assert.equal(await resolve('gmail', { owner: 'other' }), 'other-access');

  const restored = await vault.getToken({ owner: 'adrien', connector_id: 'gmail' });
  assert.equal(restored.refresh_token, 'adrien-refresh');
  assert.equal(JSON.stringify(await resolve('gmail', { owner: 'adrien' })).includes('refresh'), false);
});

test('ciphertext tampering and wrong encryption key fail closed', async () => {
  const db = new FakeD1();
  const vault = new D1OAuthVaults(db, { codec: codec() });
  await vault.putToken({
    owner: 'adrien',
    connector_id: 'gmail',
    token_set: { access_token: 'secret', refresh_token: 'refresh', scopes: [] },
  });

  const row = db.tokens.get('adrien::gmail');
  const envelope = JSON.parse(row.envelope_json);
  const raw = atob(envelope.ciphertext_b64);
  envelope.ciphertext_b64 = btoa(String.fromCharCode(raw.charCodeAt(0) ^ 1) + raw.slice(1));
  row.envelope_json = JSON.stringify(envelope);

  await assert.rejects(
    () => vault.getToken({ owner: 'adrien', connector_id: 'gmail' }),
    { code: 'OAUTH_VAULT_CIPHERTEXT_INTEGRITY_MISMATCH' },
  );

  const cleanDb = new FakeD1();
  const source = new D1OAuthVaults(cleanDb, { codec: codec(1) });
  await source.putToken({
    owner: 'adrien',
    connector_id: 'gmail',
    token_set: { access_token: 'secret', scopes: [] },
  });
  const wrong = new D1OAuthVaults(cleanDb, { codec: codec(2) });
  await assert.rejects(
    () => wrong.getToken({ owner: 'adrien', connector_id: 'gmail' }),
    { code: 'OAUTH_VAULT_DECRYPTION_FAILED' },
  );
});

test('token deletion removes durable token and resolver then returns empty string', async () => {
  const db = new FakeD1();
  const vault = new D1OAuthVaults(db, { codec: codec() });
  await vault.putToken({
    owner: 'adrien',
    connector_id: 'google-tasks',
    token_set: { access_token: 'tasks-access', scopes: ['tasks'] },
  });
  assert.equal(await vault.deleteToken({ owner: 'adrien', connector_id: 'google-tasks' }), true);
  assert.equal(await vault.getToken({ owner: 'adrien', connector_id: 'google-tasks' }), null);
  assert.equal(await vault.accessTokenResolver()('google-tasks', { owner: 'adrien' }), '');
});

test('environment codec preserves legacy OAuth keys and derives a recoverable HKDF key from backup root', async () => {
  assert.throws(
    () => createEnvOAuthVaultCodec({}),
    { code: 'OAUTH_VAULT_RECOVERY_KEY_ID_REQUIRED' },
  );
  assert.throws(
    () => createEnvOAuthVaultCodec({
      MEL_OAUTH_ENCRYPTION_KEY_ID: 'oauth-key',
      MEL_BACKUP_ENCRYPTION_KEY_ID: 'backup-key',
      MEL_BACKUP_ENCRYPTION_KEY_B64: btoa(String.fromCharCode(...key(9))),
    }),
    { code: 'OAUTH_VAULT_KEY_REQUIRED' },
  );
  assert.throws(
    () => createEnvOAuthVaultCodec({
      MEL_OAUTH_ENCRYPTION_KEY_ID: 'oauth-key',
      MEL_OAUTH_ENCRYPTION_KEY_B64: btoa('short'),
    }),
    { code: 'OAUTH_VAULT_KEY_MUST_BE_32_BYTES' },
  );

  const legacy = createEnvOAuthVaultCodec({
    MEL_OAUTH_ENCRYPTION_KEY_ID: 'oauth-key',
    MEL_OAUTH_ENCRYPTION_KEY_B64: btoa(String.fromCharCode(...key())),
    MEL_BACKUP_ENCRYPTION_KEY_ID: 'backup-key',
    MEL_BACKUP_ENCRYPTION_KEY_B64: btoa(String.fromCharCode(...key(9))),
  });
  assert.equal(legacy.key_id, 'oauth-key');
  assert.equal(legacy.algorithm, 'AES-GCM-256');

  const recoveryEnv = {
    MEL_BACKUP_ENCRYPTION_KEY_ID: 'backup-key-2026',
    MEL_BACKUP_ENCRYPTION_KEY_B64: btoa(String.fromCharCode(...key(41))),
  };
  const derivedA = createEnvOAuthVaultCodec(recoveryEnv);
  const derivedB = createEnvOAuthVaultCodec(recoveryEnv);
  assert.equal(derivedA.key_id, 'oauth-hkdf-v1:backup-key-2026');
  assert.equal(derivedB.key_id, derivedA.key_id);

  const aad = { kind: 'token', owner: 'adrien', connector_id: 'gmail' };
  const envelope = await derivedA.seal({ access_token: 'recoverable-token', scopes: [] }, aad);
  const opened = await derivedB.open(envelope, aad);
  assert.equal(opened.access_token, 'recoverable-token');
  assert.doesNotMatch(JSON.stringify(envelope), /recoverable-token/);
});


test('wrong backup root with the same key identity fails closed', async () => {
  const aad = { kind: 'token', owner: 'adrien', connector_id: 'gmail' };
  const source = createEnvOAuthVaultCodec({
    MEL_BACKUP_ENCRYPTION_KEY_ID: 'backup-key-stable',
    MEL_BACKUP_ENCRYPTION_KEY_B64: btoa(String.fromCharCode(...key(31))),
  });
  const envelope = await source.seal({ access_token: 'recoverable-token' }, aad);
  const wrong = createEnvOAuthVaultCodec({
    MEL_BACKUP_ENCRYPTION_KEY_ID: 'backup-key-stable',
    MEL_BACKUP_ENCRYPTION_KEY_B64: btoa(String.fromCharCode(...key(63))),
  });
  await assert.rejects(
    () => wrong.open(envelope, aad),
    { code: 'OAUTH_VAULT_DECRYPTION_FAILED' },
  );
});

test('derived codec preserves legacy mel-oauth-v1 rows and asks for reconnect', async () => {
  const aad = { kind: 'token', owner: 'adrien', connector_id: 'gmail' };
  const legacy = createOAuthVaultCodec({
    keyBytes: key(3),
    keyId: 'mel-oauth-v1',
    randomBytes: iv,
  });
  const envelope = await legacy.seal({ access_token: 'legacy-token' }, aad);
  const derived = createEnvOAuthVaultCodec({
    MEL_BACKUP_ENCRYPTION_KEY_ID: 'backup-key-stable',
    MEL_BACKUP_ENCRYPTION_KEY_B64: btoa(String.fromCharCode(...key(31))),
  });
  await assert.rejects(
    () => derived.open(envelope, aad),
    { code: 'OAUTH_VAULT_LEGACY_KEY_UNAVAILABLE_RECONNECT_REQUIRED' },
  );
});

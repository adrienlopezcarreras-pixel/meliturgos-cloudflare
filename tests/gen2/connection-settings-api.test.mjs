import test from 'node:test';
import assert from 'node:assert/strict';

import { maybeHandleConnectionSettingsApi } from '../../src/api/connection-settings-api.js';

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
    if (this.sql.startsWith('CREATE TABLE')) return { success: true, meta: { changes: 0 } };
    if (this.sql.startsWith('INSERT INTO mel_oauth_tokens')) {
      const [owner, connector_id, envelope_json, updated_at] = this.args;
      this.db.tokens.set(owner + '::' + connector_id, { owner, connector_id, envelope_json, updated_at });
      return { success: true, meta: { changes: 1 } };
    }
    if (this.sql === 'DELETE FROM mel_oauth_tokens WHERE owner=? AND connector_id=?') {
      const changed = this.db.tokens.delete(this.args[0] + '::' + this.args[1]);
      return { success: true, meta: { changes: changed ? 1 : 0 } };
    }
    throw new Error('UNEXPECTED_SQL_RUN:' + this.sql);
  }
  async first() {
    if (this.sql === 'SELECT envelope_json FROM mel_oauth_tokens WHERE owner=? AND connector_id=?') {
      const row = this.db.tokens.get(this.args[0] + '::' + this.args[1]);
      return row ? { envelope_json: row.envelope_json } : null;
    }
    throw new Error('UNEXPECTED_SQL_FIRST:' + this.sql);
  }
}

class FakeD1 {
  constructor() {
    this.tokens = new Map();
  }
  prepare(sql) {
    return new Statement(this, sql);
  }
}

function keyB64() {
  const bytes = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function env() {
  return {
    DB: new FakeD1(),
    MELITURGOS_USER: 'adrien',
    MEL_OAUTH_ENCRYPTION_KEY_ID: 'connections-test-key',
    MEL_OAUTH_ENCRYPTION_KEY_B64: keyB64(),
    MEL_PUBLIC_ORIGIN: 'https://mel.example',
  };
}

async function call(path, options, runtimeEnv) {
  const request = new Request('https://mel.example' + path, options);
  return maybeHandleConnectionSettingsApi(request, runtimeEnv, new URL(request.url));
}

test('OAuth app credentials are encrypted at rest and never returned by status', async () => {
  const runtimeEnv = env();
  const response = await call('/api/gen2/connections/google/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: 'google-client-id-secretish',
      client_secret: 'google-client-secret-value',
    }),
  }, runtimeEnv);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.app_configured, true);
  assert.equal(body.client_id_present, true);
  assert.equal(body.client_secret_present, true);
  assert.equal(JSON.stringify(body).includes('google-client-id-secretish'), false);
  assert.equal(JSON.stringify(body).includes('google-client-secret-value'), false);

  const raw = JSON.stringify([...runtimeEnv.DB.tokens.values()]);
  assert.equal(raw.includes('google-client-id-secretish'), false);
  assert.equal(raw.includes('google-client-secret-value'), false);
  assert.match(raw, /MEL_OAUTH_VAULT_V1/);

  const status = await call('/api/gen2/connections/google/status', { method: 'GET' }, runtimeEnv);
  assert.equal(status.status, 200);
  const state = await status.json();
  assert.equal(state.app_configured, true);
  assert.equal(state.connectors.gmail.authorized, false);
});

test('Roundcube IMAP/SMTP password is encrypted and status returns only non-secret metadata', async () => {
  const runtimeEnv = env();
  const response = await call('/api/gen2/connections/roundcube/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      imap_host: 'imap.example.test',
      imap_port: 993,
      imap_security: 'tls',
      smtp_host: 'smtp.example.test',
      smtp_port: 465,
      smtp_security: 'tls',
      username: 'mail@example.test',
      password: 'roundcube-password-secret',
    }),
  }, runtimeEnv);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.configured, true);
  assert.equal(body.password_present, true);
  assert.equal(body.password, undefined);
  assert.equal(JSON.stringify(body).includes('roundcube-password-secret'), false);

  const raw = JSON.stringify([...runtimeEnv.DB.tokens.values()]);
  assert.equal(raw.includes('roundcube-password-secret'), false);
  assert.equal(raw.includes('mail@example.test'), false);

  const status = await call('/api/gen2/connections/roundcube/status', { method: 'GET' }, runtimeEnv);
  const state = await status.json();
  assert.equal(state.configured, true);
  assert.equal(state.username, 'mail@example.test');
  assert.equal(state.password_present, true);
  assert.equal(state.password, undefined);
});


test('Vercel token is encrypted at rest and status never returns it', async () => {
  const runtimeEnv = env();
  const response = await call('/api/gen2/connections/vercel/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      token: 'vercel-secret-token-value',
      team_id: 'team_123',
      project_id: 'prj_123',
      project_name: 'meliturgos',
    }),
  }, runtimeEnv);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.token_present, true);
  assert.equal(body.project_id, 'prj_123');
  assert.equal(body.token, undefined);
  assert.equal(JSON.stringify(body).includes('vercel-secret-token-value'), false);

  const raw = JSON.stringify([...runtimeEnv.DB.tokens.values()]);
  assert.equal(raw.includes('vercel-secret-token-value'), false);
  assert.match(raw, /MEL_OAUTH_VAULT_V1/);

  const status = await call('/api/gen2/connections/vercel/status', { method: 'GET' }, runtimeEnv);
  const state = await status.json();
  assert.equal(state.configured, true);
  assert.equal(state.target_configured, true);
  assert.equal(state.project_name, 'meliturgos');
  assert.equal(state.token, undefined);
});

test('Yahoo/Ymail app password is encrypted and uses fixed IMAP/SMTP endpoints', async () => {
  const runtimeEnv = env();
  const response = await call('/api/gen2/connections/yahoo-imap/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: 'owner@ymail.com',
      password: 'yahoo-app-password-secret',
    }),
  }, runtimeEnv);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.configured, true);
  assert.equal(body.username, 'owner@ymail.com');
  assert.equal(body.imap_host, 'imap.mail.yahoo.com');
  assert.equal(body.imap_port, 993);
  assert.equal(body.smtp_host, 'smtp.mail.yahoo.com');
  assert.equal(body.smtp_port, 465);
  assert.equal(body.password, undefined);
  assert.equal(JSON.stringify(body).includes('yahoo-app-password-secret'), false);

  const raw = JSON.stringify([...runtimeEnv.DB.tokens.values()]);
  assert.equal(raw.includes('yahoo-app-password-secret'), false);
  assert.equal(raw.includes('owner@ymail.com'), false);

  const status = await call('/api/gen2/connections/yahoo-imap/status', { method: 'GET' }, runtimeEnv);
  const state = await status.json();
  assert.equal(state.configured, true);
  assert.equal(state.username, 'owner@ymail.com');
  assert.equal(state.password_present, true);
  assert.equal(state.password, undefined);
});

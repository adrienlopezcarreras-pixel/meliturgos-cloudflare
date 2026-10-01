import test from 'node:test';
import assert from 'node:assert/strict';

import { maybeHandleConnectionSettingsApi, probeYahooDirect, pipedreamAccessToken, pipedreamAccountStatus, testPipedreamCredentials } from '../../src/api/connection-settings-api.js';

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
  assert.equal(state.connectors['google-calendar'].authorized, false);
  assert.equal(state.connectors['google-tasks'].authorized, false);
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

test('Yahoo probe keeps IMAP 993 and falls back from SMTP 465 TLS to 587 STARTTLS', async () => {
  const seen = [];
  const config = {
    imap_host: 'imap.mail.yahoo.com',
    imap_port: 993,
    imap_security: 'tls',
    smtp_host: 'smtp.mail.yahoo.com',
    smtp_port: 465,
    smtp_security: 'tls',
    username: 'owner@ymail.com',
    password: 'app-password',
  };
  const result = await probeYahooDirect(config, {
    imapProbe: async cfg => {
      assert.equal(cfg.imap_port, 993);
      return { ok: true, protocol: 'IMAP', port: 993 };
    },
    smtpProbe: async cfg => {
      seen.push({ port: cfg.smtp_port, security: cfg.smtp_security });
      if (cfg.smtp_port === 465) {
        const error = new Error('MAIL_SOCKET_RESPONSE_INCOMPLETE');
        error.code = 'MAIL_SOCKET_RESPONSE_INCOMPLETE';
        throw error;
      }
      return { ok: true, protocol: 'SMTP', port: cfg.smtp_port };
    },
  });
  assert.deepEqual(seen, [
    { port: 465, security: 'tls' },
    { port: 587, security: 'starttls' },
  ]);
  assert.equal(result.smtp_port, 587);
  assert.equal(result.smtp_security, 'starttls');
});

test('Yahoo probe surfaces SMTP authentication rejection and does not retry another port', async () => {
  let smtpCalls = 0;
  const config = {
    imap_host: 'imap.mail.yahoo.com',
    imap_port: 993,
    imap_security: 'tls',
    smtp_host: 'smtp.mail.yahoo.com',
    smtp_port: 465,
    smtp_security: 'tls',
    username: 'owner@ymail.com',
    password: 'bad-password',
  };
  await assert.rejects(
    () => probeYahooDirect(config, {
      imapProbe: async () => ({ ok: true, protocol: 'IMAP' }),
      smtpProbe: async () => {
        smtpCalls += 1;
        const error = new Error('SMTP_AUTH_REJECTED');
        error.code = 'SMTP_AUTH_REJECTED';
        error.status = 409;
        throw error;
      },
    }),
    error => {
      assert.equal(error.code, 'YAHOO_SMTP_SMTP_AUTH_REJECTED');
      assert.equal(error.status, 409);
      return true;
    },
  );
  assert.equal(smtpCalls, 1);
});

test('Pipedream Connect credentials are encrypted at rest and status never returns secrets', async () => {
  const runtimeEnv = env();
  const response = await call('/api/gen2/connections/pipedream/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      project_id: 'proj_demo123',
      client_id: 'pd-client-id-secretish',
      client_secret: 'pd-client-secret-value',
      environment: 'production',
    }),
  }, runtimeEnv);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.configured, true);
  assert.equal(body.project_id, 'proj_demo123');
  assert.equal(body.client_id_present, true);
  assert.equal(body.client_secret_present, true);
  assert.equal(body.client_id, undefined);
  assert.equal(body.client_secret, undefined);
  assert.equal(JSON.stringify(body).includes('pd-client-secret-value'), false);

  const raw = JSON.stringify([...runtimeEnv.DB.tokens.values()]);
  assert.equal(raw.includes('pd-client-id-secretish'), false);
  assert.equal(raw.includes('pd-client-secret-value'), false);
  assert.match(raw, /MEL_OAUTH_VAULT_V1/);

  const status = await call('/api/gen2/connections/pipedream/status', { method: 'GET' }, runtimeEnv);
  const state = await status.json();
  assert.equal(state.configured, true);
  assert.equal(state.project_id, 'proj_demo123');
  assert.deepEqual(state.supported_apps.sort(), [
    'dropbox',
    'google_calendar',
    'google_drive',
    'google_tasks',
    'imap',
    'lemlist',
    'microsoft_onedrive',
    'microsoft_outlook',
    'sharepoint',
  ]);
});

test('Pipedream access token exchange matches the official SDK client-credentials contract', async () => {
  const calls = [];
  const token = await pipedreamAccessToken({
    project_id: 'proj_demo123',
    client_id: 'client-id',
    client_secret: 'client-secret',
    environment: 'production',
  }, {
    fetcher: async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json({ access_token: 'short-lived-token', expires_in: 3600 });
    },
  });
  assert.equal(token, 'short-lived-token');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.pipedream.com/v1/oauth/token');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.redirect, 'manual');
  assert.equal(calls[0].init.headers['content-type'], 'application/x-www-form-urlencoded');
  const body = new URLSearchParams(String(calls[0].init.body));
  assert.equal(body.get('grant_type'), 'client_credentials');
  assert.equal(body.get('client_id'), 'client-id');
  assert.equal(body.get('client_secret'), 'client-secret');
  assert.equal(body.get('project_id'), 'proj_demo123');
  assert.equal(body.get('environment'), 'production');
});

test('Pipedream real project probe checks Outlook and OneDrive component catalogs', async () => {
  const calls = [];
  const result = await testPipedreamCredentials({
    project_id: 'proj_demo123',
    client_id: 'client-id',
    client_secret: 'client-secret',
    environment: 'production',
  }, {
    fetcher: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/v1/oauth/token')) return Response.json({ access_token: 'access' });
      return Response.json({ data: [{ key: 'one' }, { key: 'two' }] });
    },
  });
  assert.equal(result.authenticated, true);
  assert.equal(result.project_id, 'proj_demo123');
  assert.equal(result.apps.microsoft_outlook.component_count, 2);
  assert.equal(result.apps.microsoft_onedrive.component_count, 2);
  assert.equal(calls.filter(call => call.url.includes('/components?app=')).length, 2);
  assert.equal(calls.every(call => call.init.redirect === 'manual'), true);
});

test('Pipedream account status uses the server access token and filters by MEL external user', async () => {
  const calls = [];
  const result = await pipedreamAccountStatus({
    project_id: 'proj_demo123',
    client_id: 'client-id',
    client_secret: 'client-secret',
    environment: 'production',
  }, 'adrien', {
    fetcher: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/v1/oauth/token')) {
        return Response.json({ access_token: 'server-token', token_type: 'Bearer', expires_in: 3600 });
      }
      return Response.json({
        data: [
          { id: 'apn_outlook', name: 'Outlook', healthy: true, dead: false, app: { name_slug: 'microsoft_outlook' } },
          { id: 'apn_onedrive', name: 'OneDrive', healthy: true, dead: false, app: { name_slug: 'microsoft_onedrive' } },
          { id: 'apn_dead', name: 'SharePoint', healthy: false, dead: true, app: { name_slug: 'sharepoint' } },
        ],
      });
    },
  });
  assert.deepEqual(result.connected_apps.sort(), ['microsoft_onedrive', 'microsoft_outlook']);
  const accountsCall = calls.find(call => call.url.includes('/accounts?'));
  assert.ok(accountsCall);
  assert.match(accountsCall.url, /external_user_id=adrien/);
  assert.equal(accountsCall.init.headers.authorization, 'Bearer server-token');
  assert.equal(accountsCall.init.headers['x-pd-environment'], 'production');
});

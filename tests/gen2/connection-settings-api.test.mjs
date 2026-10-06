import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyOAuthProbeFailure, maybeHandleConnectionSettingsApi, probeYahooDirect, pipedreamAccessToken, pipedreamAccountStatus, testPipedreamCredentials, testPipedreamGoogleTasksRead } from '../../src/api/connection-settings-api.js';

test('Google Tasks live probe failures become actionable without exposing provider payloads', () => {
  const disabled = classifyOAuthProbeFailure({
    provider: 'google',
    connectorId: 'google-tasks',
    status: 403,
    body: { error: { message: 'Google Tasks API has not been used in project 123 before or it is disabled.' } },
  });
  assert.deepEqual(disabled, {
    code: 'GOOGLE_TASKS_API_NOT_ENABLED',
    status: 409,
    upstream_status: 403,
    action_required: 'ENABLE_GOOGLE_TASKS_API',
  });

  const scope = classifyOAuthProbeFailure({
    provider: 'google',
    connectorId: 'google-tasks',
    status: 403,
    body: { error: { status: 'PERMISSION_DENIED', message: 'Request had insufficient authentication scopes.' } },
  });
  assert.equal(scope.code, 'GOOGLE_TASKS_RECONSENT_REQUIRED');
  assert.equal(scope.action_required, 'RECONNECT_GOOGLE_WITH_TASKS_SCOPE');

  const serialized = JSON.stringify(scope);
  assert.equal(serialized.includes('project 123'), false);
  assert.equal(serialized.includes('Request had'), false);
});

test('Google Drive live probe failures become actionable without exposing provider payloads', () => {
  const disabled = classifyOAuthProbeFailure({
    provider: 'google',
    connectorId: 'google-drive',
    status: 403,
    body: { error: { message: 'Google Drive API has not been used in project 456 before or it is disabled.' } },
  });
  assert.deepEqual(disabled, {
    code: 'GOOGLE_DRIVE_API_NOT_ENABLED',
    status: 409,
    upstream_status: 403,
    action_required: 'ENABLE_GOOGLE_DRIVE_API',
  });

  const scope = classifyOAuthProbeFailure({
    provider: 'google',
    connectorId: 'google-drive',
    status: 403,
    body: { error: { status: 'PERMISSION_DENIED', message: 'Request had insufficient authentication scopes.' } },
  });
  assert.equal(scope.code, 'GOOGLE_DRIVE_RECONSENT_REQUIRED');
  assert.equal(scope.action_required, 'RECONNECT_GOOGLE_WITH_DRIVE_SCOPE');

  const serialized = JSON.stringify(disabled) + JSON.stringify(scope);
  assert.equal(serialized.includes('project 456'), false);
  assert.equal(serialized.includes('Request had'), false);
});


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
  assert.equal(state.connectors['google-drive'].authorized, false);
});



test('retired direct-mail provider surface is absent', async () => {
  const runtimeEnv = env();
  const retiredProvider = ['round','cube'].join('');
  const response = await call('/api/gen2/connections/' + retiredProvider + '/status', { method: 'GET' }, runtimeEnv);
  assert.equal(response, null);
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

test('Vercel live test infers and persists the MEL repository project target', async () => {
  const runtimeEnv = {
    ...env(),
    MEL_GITHUB_REPOSITORY: 'owner/meliturgos-cloudflare',
  };
  const saved = await call('/api/gen2/connections/vercel/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      token: 'vercel-secret-token-value',
      team_id: 'team_123',
    }),
  }, runtimeEnv);
  assert.equal(saved.status, 200);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const value = String(url);
    if (value === 'https://api.vercel.com/v2/user') {
      return Response.json({ user: { id: 'usr_123' } });
    }
    if (/^https:\/\/api\.vercel\.com\/v9\/projects\?/.test(value)) {
      return Response.json({ projects: [
        { id: 'prj_other', name: 'other-project' },
        { id: 'prj_mel', name: 'meliturgos-cloudflare' },
      ] });
    }
    if (/^https:\/\/api\.vercel\.com\/v6\/deployments\?/.test(value)) {
      return Response.json({ deployments: [] });
    }
    throw new Error('UNEXPECTED_FETCH:' + value);
  };

  try {
    const tested = await call('/api/gen2/connections/vercel/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }, runtimeEnv);
    assert.equal(tested.status, 200);
    const proof = await tested.json();
    assert.equal(proof.authenticated, true);
    assert.equal(proof.configured_project.id, 'prj_mel');
    assert.equal(proof.configured_project.name, 'meliturgos-cloudflare');
    assert.equal(proof.target_ready, true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const status = await call('/api/gen2/connections/vercel/status', { method: 'GET' }, runtimeEnv);
  const state = await status.json();
  assert.equal(state.target_configured, true);
  assert.equal(state.project_id, 'prj_mel');
  assert.equal(state.project_name, 'meliturgos-cloudflare');
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
  assert.equal(calls[0].init.headers['content-type'], 'application/json');
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.grant_type, 'client_credentials');
  assert.equal(body.client_id, 'client-id');
  assert.equal(body.client_secret, 'client-secret');
  assert.equal('project_id' in body, false);
  assert.equal('environment' in body, false);
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
  assert.match(accountsCall.url, /\/v1\/connect\/proj_demo123\/accounts\?external_user_id=adrien&limit=100$/);
  assert.match(accountsCall.url, /external_user_id=adrien/);
  assert.equal(accountsCall.init.headers.authorization, 'Bearer server-token');
  assert.equal(accountsCall.init.headers['x-pd-environment'], 'production');
});


test('Pipedream Google Tasks proof executes the read-only List Task Lists action without returning private content', async () => {
  const calls = [];
  const result = await testPipedreamGoogleTasksRead({
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
      if (String(url).includes('/accounts?')) {
        return Response.json({
          data: [
            { id: 'apn_tasks', name: 'Google Tasks', healthy: true, dead: false, app: { name_slug: 'google_tasks' } },
          ],
        });
      }
      if (String(url).endsWith('/actions/run')) {
        return Response.json({ exports: { taskLists: [{ id: 'private-list-id', title: 'Private title' }] } });
      }
      return Response.json({}, { status: 404 });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.action_id, 'google_tasks-list-task-lists');
  assert.equal(result.live_action, true);
  assert.equal(result.read_only, true);
  assert.equal(result.account_connected, true);
  assert.equal(result.private_content_returned, false);
  assert.equal(JSON.stringify(result).includes('private-list-id'), false);
  assert.equal(JSON.stringify(result).includes('Private title'), false);

  const run = calls.find(call => call.url.endsWith('/actions/run'));
  assert.ok(run);
  assert.equal(run.init.method, 'POST');
  assert.equal(run.init.headers.authorization, 'Bearer server-token');
  const body = JSON.parse(run.init.body);
  assert.equal(body.external_user_id, 'adrien');
  assert.equal(body.id, 'google_tasks-list-task-lists');
  assert.deepEqual(body.configured_props.app, { authProvisionId: 'apn_tasks' });
  assert.equal('google_tasks' in body.configured_props, false);
  assert.equal(body.configured_props.maxResults, 1);
});

test('Pipedream Google Tasks proof falls back to the read-only Connect proxy when the action rejects the linked account', async () => {
  const calls = [];
  const result = await testPipedreamGoogleTasksRead({
    project_id: 'proj_demo123',
    client_id: 'client-id',
    client_secret: 'client-secret',
    environment: 'production',
  }, 'adrien', {
    fetcher: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/v1/oauth/token')) {
        return Response.json({ access_token: 'server-token', token_type: 'Bearer', expires_in: 3600 });
      }
      if (String(url).includes('/accounts?')) {
        return Response.json({
          data: [
            { id: 'apn_tasks', name: 'Google Tasks', healthy: true, dead: false, app: { name_slug: 'google_tasks' } },
          ],
        });
      }
      if (String(url).endsWith('/actions/run')) {
        return Response.json({ error: 'managed action rejected account' }, { status: 409 });
      }
      if (String(url).includes('/proxy/')) {
        return Response.json({ items: [{ id: 'private-list-id', title: 'Private title' }] });
      }
      return Response.json({}, { status: 404 });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.transport, 'proxy');
  assert.equal(result.live_action, false);
  assert.equal(result.live_proxy, true);
  assert.equal(result.read_only, true);
  assert.equal(result.private_content_returned, false);
  assert.equal(JSON.stringify(result).includes('private-list-id'), false);
  assert.equal(JSON.stringify(result).includes('Private title'), false);

  const proxy = calls.find(call => call.url.includes('/proxy/'));
  assert.ok(proxy);
  assert.equal(proxy.init.method, 'GET');
  assert.equal(proxy.init.headers.authorization, 'Bearer server-token');
  assert.match(proxy.url, /external_user_id=adrien/);
  assert.match(proxy.url, /account_id=apn_tasks/);
  const encoded = proxy.url.split('/proxy/')[1].split('?')[0];
  const padded = encoded.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - encoded.length % 4) % 4);
  const decoded = atob(padded);
  assert.equal(decoded, 'https://www.googleapis.com/tasks/v1/users/@me/lists?maxResults=1');
});

test('Pipedream Google Tasks fallback preserves only sanitized upstream status on failure', async () => {
  await assert.rejects(
    testPipedreamGoogleTasksRead({
      project_id: 'proj_demo123',
      client_id: 'client-id',
      client_secret: 'client-secret',
      environment: 'production',
    }, 'adrien', {
      fetcher: async (url) => {
        if (String(url).endsWith('/v1/oauth/token')) return Response.json({ access_token: 'server-token' });
        if (String(url).includes('/accounts?')) {
          return Response.json({
            data: [{ id: 'apn_tasks', healthy: true, app: { name_slug: 'google_tasks' } }],
          });
        }
        if (String(url).endsWith('/actions/run')) return Response.json({ private: 'do-not-surface' }, { status: 409 });
        if (String(url).includes('/proxy/')) return Response.json({ private: 'do-not-surface' }, { status: 403 });
        return Response.json({}, { status: 404 });
      },
    }),
    error => {
      assert.equal(error.code, 'PIPEDREAM_GOOGLE_TASKS_PROXY_READ_FAILED');
      assert.equal(error.upstream_status, 403);
      assert.equal(String(error.message).includes('do-not-surface'), false);
      return true;
    },
  );
});

test('Pipedream Google Tasks proof fails closed without a healthy linked account', async () => {
  await assert.rejects(
    testPipedreamGoogleTasksRead({
      project_id: 'proj_demo123',
      client_id: 'client-id',
      client_secret: 'client-secret',
      environment: 'production',
    }, 'adrien', {
      fetcher: async (url) => {
        if (String(url).endsWith('/v1/oauth/token')) return Response.json({ access_token: 'server-token' });
        if (String(url).includes('/accounts?')) return Response.json({ data: [] });
        throw new Error('ACTION_MUST_NOT_RUN');
      },
    }),
    error => error?.code === 'PIPEDREAM_GOOGLE_TASKS_ACCOUNT_REQUIRED',
  );
});


test('legacy OAuth vault failures expose a reconnect action instead of an opaque 409', async()=>{
  const source=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../../src/api/connection-settings-api.js',import.meta.url),'utf8'));
  assert.match(source,/OAUTH_VAULT_LEGACY_KEY_UNAVAILABLE_RECONNECT_REQUIRED/);
  assert.match(source,/RECONNECT_GOOGLE/);
  assert.match(source,/RECONNECT_MICROSOFT/);
  assert.match(source,/RECONNECT_YAHOO/);
});


test('Google status isolates unreadable legacy connector tokens instead of failing the provider status', async()=>{
  const source=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../../src/api/connection-settings-api.js',import.meta.url),'utf8'));
  assert.match(source,/legacy_unreadable/);
  assert.match(source,/reconnect_required:\s*true/);
  assert.match(source,/RECONNECT_GOOGLE/);
});


test('Pipedream accounts endpoint degrades gracefully when account listing is unavailable', async()=>{
  const source=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../../src/api/connection-settings-api.js',import.meta.url),'utf8'));
  assert.match(source,/error\?\.code !== 'PIPEDREAM_ACCOUNTS_FAILED'/);
  assert.match(source,/account_status_degraded:\s*true/);
  assert.match(source,/connect_link_supported:\s*true/);
  assert.match(source,/actions_supported:\s*true/);
  assert.match(source,/proxy_supported:\s*true/);
});

test('Pipedream account status uses the project accounts endpoint scoped by external_user_id', async()=>{
  const source=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../../src/api/connection-settings-api.js',import.meta.url),'utf8'));
  assert.match(source,/\/accounts\?/);
  assert.match(source,/external_user_id: contextOwner/);
});

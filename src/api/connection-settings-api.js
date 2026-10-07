import { createD1OAuthVaults } from '../connectors/d1-oauth-vault.js';
import { createGoogleOAuthRuntime } from '../connectors/google-oauth-runtime.js';
import { createMailOAuthRuntime } from '../connectors/mail-oauth-runtime.js';
import { createVercelConfigResolver, saveVercelConnectionConfig } from '../connectors/vercel-config.js';

const PROVIDERS = new Set(['google','microsoft','yahoo','yahoo-imap','vercel','pipedream']);
const OAUTH_APP_KEYS = Object.freeze({
  google: Object.freeze({ id: 'oauth-app-google', clientIdEnv: 'GOOGLE_OAUTH_CLIENT_ID', clientSecretEnv: 'GOOGLE_OAUTH_CLIENT_SECRET' }),
  microsoft: Object.freeze({ id: 'oauth-app-microsoft', clientIdEnv: 'MICROSOFT_OAUTH_CLIENT_ID', clientSecretEnv: 'MICROSOFT_OAUTH_CLIENT_SECRET' }),
  yahoo: Object.freeze({ id: 'oauth-app-yahoo', clientIdEnv: 'YAHOO_OAUTH_CLIENT_ID', clientSecretEnv: 'YAHOO_OAUTH_CLIENT_SECRET' }),
});
const PROVIDER_CONNECTORS = Object.freeze({
  google: Object.freeze(['gmail','google-calendar','google-tasks','google-drive']),
  microsoft: Object.freeze(['microsoft-mail','microsoft-onedrive','microsoft-sharepoint']),
  yahoo: Object.freeze(['yahoo-mail']),
});

function clean(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function owner(env = {}) {
  return clean(env.MELITURGOS_USER || 'owner', 200) || 'owner';
}

function appKey(provider) {
  const cfg = OAUTH_APP_KEYS[provider];
  if (!cfg) {
    const error = new Error('OAUTH_APP_PROVIDER_UNSUPPORTED');
    error.code = 'OAUTH_APP_PROVIDER_UNSUPPORTED';
    error.status = 404;
    throw error;
  }
  return cfg;
}

function isHost(value) {
  const host = clean(value, 255);
  return Boolean(host) && /^[a-z0-9.-]+$/i.test(host) && !host.startsWith('.') && !host.endsWith('.');
}

function port(value, fallback) {
  const n = Number(value ?? fallback);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return null;
  return n;
}

function b64Utf8(value) {
  const bytes = new TextEncoder().encode(String(value ?? ''));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + 0x8000)));
  }
  return btoa(binary);
}

function b64UrlUtf8(value) {
  return b64Utf8(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function quotedImap(value) {
  return '"' + String(value ?? '').replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"';
}

async function timeoutRead(reader, matcher, timeoutMs = 9000) {
  const decoder = new TextDecoder();
  let text = '';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const left = Math.max(1, deadline - Date.now());
    let timer;
    const next = await Promise.race([
      reader.read(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('MAIL_SOCKET_TIMEOUT'), { code: 'MAIL_SOCKET_TIMEOUT' })), left);
      }),
    ]).finally(() => clearTimeout(timer));
    if (next.done) break;
    text += decoder.decode(next.value, { stream: true });
    if (matcher(text)) return text;
    if (text.length > 64_000) break;
  }
  const error = new Error('MAIL_SOCKET_RESPONSE_INCOMPLETE');
  error.code = 'MAIL_SOCKET_RESPONSE_INCOMPLETE';
  throw error;
}

async function writeLine(writer, value) {
  await writer.write(new TextEncoder().encode(String(value) + '\r\n'));
}

async function directSocket(hostname, socketPort, security = 'tls') {
  const mod = await import('cloudflare:sockets');
  return mod.connect(
    { hostname, port: socketPort },
    { secureTransport: security === 'starttls' ? 'starttls' : 'on', allowHalfOpen: false },
  );
}

async function imapAuthProbe(config) {
  let socket = await directSocket(config.imap_host, config.imap_port, config.imap_security);
  let reader = socket.readable.getReader();
  let writer = socket.writable.getWriter();
  try {
    const greeting = await timeoutRead(reader, text => /(?:^|\r\n)\*\s+(?:OK|PREAUTH)\b/i.test(text));
    if (!/(?:^|\r\n)\*\s+(?:OK|PREAUTH)\b/i.test(greeting)) throw Object.assign(new Error('IMAP_GREETING_REJECTED'), { code: 'IMAP_GREETING_REJECTED' });

    if (config.imap_security === 'starttls') {
      await writeLine(writer, 'A0 STARTTLS');
      const tlsReady = await timeoutRead(reader, text => /(?:^|\r\n)A0\s+(?:OK|NO|BAD)\b/i.test(text));
      if (!/(?:^|\r\n)A0\s+OK\b/i.test(tlsReady)) throw Object.assign(new Error('IMAP_STARTTLS_REJECTED'), { code: 'IMAP_STARTTLS_REJECTED' });
      reader.releaseLock();
      writer.releaseLock();
      socket = socket.startTls();
      reader = socket.readable.getReader();
      writer = socket.writable.getWriter();
    }

    await writeLine(writer, 'A1 LOGIN ' + quotedImap(config.username) + ' ' + quotedImap(config.password));
    const login = await timeoutRead(reader, text => /(?:^|\r\n)A1\s+(?:OK|NO|BAD)\b/i.test(text));
    if (!/(?:^|\r\n)A1\s+OK\b/i.test(login)) throw Object.assign(new Error('IMAP_AUTH_REJECTED'), { code: 'IMAP_AUTH_REJECTED' });
    await writeLine(writer, 'A2 LOGOUT').catch(() => {});
    return { ok: true, protocol: 'IMAP', host: config.imap_host, port: config.imap_port };
  } finally {
    try { reader.releaseLock(); } catch {}
    try { await writer.close(); } catch {}
    try { socket.close(); } catch {}
  }
}

async function smtpReadCode(reader, code) {
  const expected = String(code);
  return timeoutRead(reader, text => {
    if (new RegExp('(?:^|\\r\\n)' + expected + ' ').test(text)) return true;
    const failure = text.match(/(?:^|\\r\\n)([45]\\d\\d) [^\\r\\n]*/);
    if (!failure) return false;
    const authStep = expected === '235' || expected === '334';
    const error = new Error(authStep ? 'SMTP_AUTH_REJECTED' : 'SMTP_COMMAND_REJECTED');
    error.code = authStep ? 'SMTP_AUTH_REJECTED' : 'SMTP_COMMAND_REJECTED';
    error.status = authStep ? 409 : 502;
    throw error;
  });
}

async function smtpAuthProbe(config) {
  let socket = await directSocket(config.smtp_host, config.smtp_port, config.smtp_security);
  let reader = socket.readable.getReader();
  let writer = socket.writable.getWriter();
  try {
    await smtpReadCode(reader, 220);
    await writeLine(writer, 'EHLO meliturgos.local');
    await smtpReadCode(reader, 250);

    if (config.smtp_security === 'starttls') {
      await writeLine(writer, 'STARTTLS');
      await smtpReadCode(reader, 220);
      reader.releaseLock();
      writer.releaseLock();
      socket = socket.startTls();
      reader = socket.readable.getReader();
      writer = socket.writable.getWriter();
      await writeLine(writer, 'EHLO meliturgos.local');
      await smtpReadCode(reader, 250);
    }

    await writeLine(writer, 'AUTH LOGIN');
    await smtpReadCode(reader, 334);
    await writeLine(writer, b64Utf8(config.username));
    await smtpReadCode(reader, 334);
    await writeLine(writer, b64Utf8(config.password));
    await smtpReadCode(reader, 235);
    await writeLine(writer, 'QUIT').catch(() => {});
    return { ok: true, protocol: 'SMTP', host: config.smtp_host, port: config.smtp_port };
  } finally {
    try { reader.releaseLock(); } catch {}
    try { await writer.close(); } catch {}
    try { socket.close(); } catch {}
  }
}

function mailProbeError(prefix, error) {
  const raw = clean(error?.code || error?.message || 'MAIL_PROBE_FAILED', 120).replace(/[^A-Z0-9_]/gi, '_').toUpperCase();
  const wrapped = new Error(prefix + '_' + raw);
  wrapped.code = prefix + '_' + raw;
  wrapped.status = Number(error?.status) || 502;
  return wrapped;
}

export async function probeYahooDirect(config, probes = {}) {
  const imapProbe = probes.imapProbe || imapAuthProbe;
  const smtpProbe = probes.smtpProbe || smtpAuthProbe;
  let imap;
  try {
    imap = await imapProbe(config);
  } catch (error) {
    throw mailProbeError('YAHOO_IMAP', error);
  }

  let smtpConfig = config;
  let smtp;
  try {
    smtp = await smtpProbe(smtpConfig);
  } catch (error) {
    const code = clean(error?.code || error?.message, 120);
    if (code === 'SMTP_AUTH_REJECTED') throw mailProbeError('YAHOO_SMTP', error);
    smtpConfig = { ...config, smtp_port: 587, smtp_security: 'starttls' };
    try {
      smtp = await smtpProbe(smtpConfig);
    } catch (fallbackError) {
      throw mailProbeError('YAHOO_SMTP', fallbackError);
    }
  }

  return {
    imap,
    smtp,
    smtp_port: Number(smtpConfig.smtp_port) || 465,
    smtp_security: smtpConfig.smtp_security === 'starttls' ? 'starttls' : 'tls',
  };
}

async function loadStoredAppConfig(env, provider, contextOwner) {
  const cfg = appKey(provider);
  const vaults = createD1OAuthVaults(env);
  return vaults.tokenVault.get({ owner: contextOwner, connector_id: cfg.id });
}

export async function resolveConnectionOAuthEnv(env = {}, provider, contextOwner = owner(env)) {
  const cfg = appKey(provider);
  const base = { ...env };
  if (clean(base[cfg.clientIdEnv], 1000) && clean(base[cfg.clientSecretEnv], 2000)) return base;
  const stored = await loadStoredAppConfig(env, provider, contextOwner).catch(() => null);
  if (!clean(base[cfg.clientIdEnv], 1000) && clean(stored?.client_id, 1000)) base[cfg.clientIdEnv] = clean(stored.client_id, 1000);
  if (!clean(base[cfg.clientSecretEnv], 2000) && clean(stored?.client_secret, 2000)) base[cfg.clientSecretEnv] = clean(stored.client_secret, 2000);
  return base;
}

async function oauthStatus(env, provider, contextOwner) {
  const cfg = appKey(provider);
  const resolved = await resolveConnectionOAuthEnv(env, provider, contextOwner);
  const appConfigured = Boolean(clean(resolved[cfg.clientIdEnv], 1000) && clean(resolved[cfg.clientSecretEnv], 2000));
  const runtime = provider === 'google'
    ? createGoogleOAuthRuntime({ env: resolved })
    : createMailOAuthRuntime({ providerId: provider, env: resolved });
  const connectors = {};
  for (const connectorId of PROVIDER_CONNECTORS[provider]) {
    try {
      connectors[connectorId] = await runtime.status(connectorId, { owner: contextOwner });
    } catch (error) {
      const code=clean(error?.code || error?.message || 'CONNECTION_STATUS_UNAVAILABLE',160);
      if (code==='OAUTH_VAULT_LEGACY_KEY_UNAVAILABLE_RECONNECT_REQUIRED') {
        connectors[connectorId] = {
          connector_id: connectorId,
          authorized: false,
          token_source: 'legacy_unreadable',
          scopes: [],
          expires_at: null,
          refreshable: false,
          reconnect_required: true,
          action_required: provider==='google' ? 'RECONNECT_GOOGLE' : provider==='microsoft' ? 'RECONNECT_MICROSOFT' : 'RECONNECT_YAHOO',
          reason: code,
        };
        continue;
      }
      throw error;
    }
  }
  return {
    provider,
    app_configured: appConfigured,
    client_id_present: Boolean(clean(resolved[cfg.clientIdEnv], 1000)),
    client_secret_present: Boolean(clean(resolved[cfg.clientSecretEnv], 2000)),
    connectors,
  };
}

export function classifyOAuthProbeFailure({ provider, connectorId, status, body } = {}) {
  const upstreamStatus = Number(status) || 0;
  const serialized = (() => {
    try { return JSON.stringify(body || {}).toLowerCase(); }
    catch { return ''; }
  })();
  let code = 'CONNECTION_LIVE_PROBE_FAILED';
  let actionRequired = null;

  if (provider === 'google' && connectorId === 'google-tasks') {
    if (upstreamStatus === 401) {
      code = 'GOOGLE_TASKS_REAUTH_REQUIRED';
      actionRequired = 'RECONNECT_GOOGLE';
    } else if (upstreamStatus === 403 && /(accessnotconfigured|service_disabled|has not been used in project|api[^a-z0-9]+(?:is )?disabled)/i.test(serialized)) {
      code = 'GOOGLE_TASKS_API_NOT_ENABLED';
      actionRequired = 'ENABLE_GOOGLE_TASKS_API';
    } else if (upstreamStatus === 403 && /(insufficientpermissions|insufficient[^a-z0-9]+(?:authentication )?scopes|access_token_scope_insufficient)/i.test(serialized)) {
      code = 'GOOGLE_TASKS_RECONSENT_REQUIRED';
      actionRequired = 'RECONNECT_GOOGLE_WITH_TASKS_SCOPE';
    } else if (upstreamStatus === 403) {
      code = 'GOOGLE_TASKS_ACCESS_FORBIDDEN';
      actionRequired = 'VERIFY_GOOGLE_TASKS_API_AND_CONSENT';
    }
  }

  if (provider === 'google' && connectorId === 'google-drive') {
    if (upstreamStatus === 401) {
      code = 'GOOGLE_DRIVE_REAUTH_REQUIRED';
      actionRequired = 'RECONNECT_GOOGLE';
    } else if (upstreamStatus === 403 && /(accessnotconfigured|service_disabled|has not been used in project|api[^a-z0-9]+(?:is )?disabled)/i.test(serialized)) {
      code = 'GOOGLE_DRIVE_API_NOT_ENABLED';
      actionRequired = 'ENABLE_GOOGLE_DRIVE_API';
    } else if (upstreamStatus === 403 && /(insufficientpermissions|insufficient[^a-z0-9]+(?:authentication )?scopes|access_token_scope_insufficient)/i.test(serialized)) {
      code = 'GOOGLE_DRIVE_RECONSENT_REQUIRED';
      actionRequired = 'RECONNECT_GOOGLE_WITH_DRIVE_SCOPE';
    } else if (upstreamStatus === 403) {
      code = 'GOOGLE_DRIVE_ACCESS_FORBIDDEN';
      actionRequired = 'VERIFY_GOOGLE_DRIVE_API_AND_CONSENT';
    }
  }

  return Object.freeze({
    code,
    status: upstreamStatus === 401 || upstreamStatus === 403 ? 409 : 502,
    upstream_status: upstreamStatus || null,
    action_required: actionRequired,
  });
}

async function testOAuthConnector(env, provider, connectorId, contextOwner, signal) {
  const resolved = await resolveConnectionOAuthEnv(env, provider, contextOwner);
  const context = { owner: contextOwner, signal };
  let token = '';
  let url = '';
  if (provider === 'google') {
    token = await createGoogleOAuthRuntime({ env: resolved }).accessTokenResolver(connectorId, context);
    if (connectorId === 'gmail') url = 'https://gmail.googleapis.com/gmail/v1/users/me/profile';
    else if (connectorId === 'google-calendar') url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1&singleEvents=true';
    else if (connectorId === 'google-tasks') url = 'https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=1';
    else if (connectorId === 'google-drive') url = 'https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)';
  } else if (provider === 'microsoft') {
    token = await createMailOAuthRuntime({ providerId: 'microsoft', env: resolved }).accessTokenResolver(connectorId, context);
    if (connectorId === 'microsoft-mail') url = 'https://graph.microsoft.com/v1.0/me/messages?$top=1&$select=id';
    else if (connectorId === 'microsoft-onedrive') url = 'https://graph.microsoft.com/v1.0/me/drive/root?$select=id,name';
    else if (connectorId === 'microsoft-sharepoint') url = 'https://graph.microsoft.com/v1.0/sites/root?$select=id,name';
  } else if (provider === 'yahoo' && connectorId === 'yahoo-mail') {
    token = await createMailOAuthRuntime({ providerId: 'yahoo', env: resolved }).accessTokenResolver(connectorId, context);
    url = 'https://api.login.yahoo.com/openid/v1/userinfo';
  }
  if (!token || !url) {
    const error = new Error('CONNECTION_TOKEN_NOT_AVAILABLE');
    error.code = 'CONNECTION_TOKEN_NOT_AVAILABLE';
    error.status = 409;
    throw error;
  }
  const response = await fetch(url, {
    headers: { authorization: 'Bearer ' + token, accept: 'application/json' },
    redirect: 'manual',
    signal: signal || AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let providerBody = {};
    if (text) {
      try { providerBody = JSON.parse(text); }
      catch { providerBody = {}; }
    }
    const failure = classifyOAuthProbeFailure({
      provider,
      connectorId,
      status: response.status,
      body: providerBody,
    });
    const error = new Error(failure.code);
    error.code = failure.code;
    error.status = failure.status;
    error.upstream_status = failure.upstream_status;
    error.action_required = failure.action_required;
    throw error;
  }
  await response.body?.cancel?.();
  return { ok: true, provider, connector_id: connectorId, live_probe: true };
}

async function yahooDirectStatus(env, contextOwner) {
  const vaults = createD1OAuthVaults(env);
  const stored = await vaults.tokenVault.get({ owner: contextOwner, connector_id: 'yahoo-imap-smtp' });
  if (!stored) {
    return {
      provider: 'yahoo-imap',
      configured: false,
      stored_securely: true,
      imap_host: 'imap.mail.yahoo.com',
      imap_port: 993,
      imap_security: 'tls',
      smtp_host: 'smtp.mail.yahoo.com',
      smtp_port: 465,
      smtp_security: 'tls',
    };
  }
  return {
    provider: 'yahoo-imap',
    configured: true,
    stored_securely: true,
    imap_host: 'imap.mail.yahoo.com',
    imap_port: 993,
    imap_security: 'tls',
    smtp_host: 'smtp.mail.yahoo.com',
    smtp_port: Number(stored.smtp_port) || 465,
    smtp_security: stored.smtp_security === 'starttls' ? 'starttls' : 'tls',
    username: clean(stored.username, 320),
    password_present: Boolean(clean(stored.password, 4000)),
  };
}

async function saveYahooDirect(env, contextOwner, body) {
  const username = clean(body.username, 320);
  const password = clean(body.password, 4000);
  if (!username || !password || !username.includes('@')) {
    const error = new Error('YAHOO_IMAP_CONFIGURATION_INVALID');
    error.code = 'YAHOO_IMAP_CONFIGURATION_INVALID';
    error.status = 400;
    throw error;
  }
  const vaults = createD1OAuthVaults(env);
  await vaults.tokenVault.put({
    owner: contextOwner,
    connector_id: 'yahoo-imap-smtp',
    token_set: {
      kind: 'imap-smtp-credentials',
      provider: 'yahoo',
      imap_host: 'imap.mail.yahoo.com',
      imap_port: 993,
      imap_security: 'tls',
      smtp_host: 'smtp.mail.yahoo.com',
      smtp_port: 465,
      smtp_security: 'tls',
      username,
      password,
      updated_at: Date.now(),
    },
  });
  return yahooDirectStatus(env, contextOwner);
}


const PIPEDREAM_CONFIG_ID = 'pipedream-connect-config';
const PIPEDREAM_ALLOWED_APPS = Object.freeze(new Set([
  'microsoft_outlook',
  'microsoft_onedrive',
  'sharepoint',
  'imap',
  'lemlist',
  'google_drive',
  'google_calendar',
  'google_tasks',
  'dropbox',
]));

async function pipedreamStoredConfig(env, contextOwner) {
  const vaults = createD1OAuthVaults(env);
  return vaults.tokenVault.get({ owner: contextOwner, connector_id: PIPEDREAM_CONFIG_ID });
}

function configuredPipedreamEnvironment(config = {}) {
  return config?.environment === 'production' ? 'production' : 'development';
}

function pipedreamEnvironmentCandidates(config = {}) {
  const configured = configuredPipedreamEnvironment(config);
  return configured === 'production' ? ['production', 'development'] : ['development'];
}

function canFallbackPipedreamEnvironment(error, environment) {
  return environment === 'production' && Number(error?.upstream_status) === 400;
}

async function pipedreamStatus(env, contextOwner) {
  const stored = await pipedreamStoredConfig(env, contextOwner).catch(() => null);
  return {
    provider: 'pipedream',
    configured: Boolean(stored?.project_id && stored?.client_id && stored?.client_secret),
    stored_securely: true,
    project_id: clean(stored?.project_id, 300) || null,
    client_id_present: Boolean(clean(stored?.client_id, 1000)),
    client_secret_present: Boolean(clean(stored?.client_secret, 2000)),
    environment: configuredPipedreamEnvironment(stored),
    external_user_id: contextOwner,
    supported_apps: [...PIPEDREAM_ALLOWED_APPS],
  };
}

async function savePipedreamConfig(env, contextOwner, body) {
  const projectId = clean(body.project_id, 300);
  const clientId = clean(body.client_id, 1000);
  const clientSecret = clean(body.client_secret, 2000);
  // Pipedream Free supports Connect in development. Production is opt-in and
  // requires a paid Connect plan, so never make it the implicit default.
  const environment = body.environment === 'production' ? 'production' : 'development';
  if (!/^proj_[A-Za-z0-9_-]+$/.test(projectId) || !clientId || !clientSecret) {
    const error = new Error('PIPEDREAM_CONFIGURATION_INVALID');
    error.code = 'PIPEDREAM_CONFIGURATION_INVALID';
    error.status = 400;
    throw error;
  }
  const vaults = createD1OAuthVaults(env);
  await vaults.tokenVault.put({
    owner: contextOwner,
    connector_id: PIPEDREAM_CONFIG_ID,
    token_set: {
      kind: 'pipedream-connect-credentials',
      project_id: projectId,
      client_id: clientId,
      client_secret: clientSecret,
      environment,
      updated_at: Date.now(),
    },
  });
  return pipedreamStatus(env, contextOwner);
}

async function pipedreamJson(fetcher, url, init, code) {
  let response;
  try {
    response = await fetcher(url, {
      ...init,
      redirect: 'manual',
      signal: init?.signal || AbortSignal.timeout(12_000),
    });
  } catch {
    const error = new Error(code);
    error.code = code;
    error.status = 503;
    throw error;
  }
  const text = await response.text().catch(() => '');
  let body = {};
  if (text) {
    try { body = JSON.parse(text); }
    catch {
      const error = new Error(code + '_INVALID_RESPONSE');
      error.code = code + '_INVALID_RESPONSE';
      error.status = 502;
      throw error;
    }
  }
  if (!response.ok) {
    const error = new Error(code);
    error.code = code;
    error.status = response.status === 401 || response.status === 403 ? 409 : 502;
    error.upstream_status = Number(response.status) || null;
    const upstreamCode = clean(body?.code || body?.error?.code || body?.error, 160);
    const upstreamMessage = clean(body?.message || body?.error?.message, 240);
    if (upstreamCode) error.upstream_code = upstreamCode;
    if (upstreamMessage) error.upstream_message = upstreamMessage;
    throw error;
  }
  return body;
}

export async function pipedreamAccessToken(config, options = {}) {
  const fetcher = options.fetcher || fetch;
  const projectId = clean(config?.project_id, 300);
  const environment = config?.environment === 'development' ? 'development' : 'production';
  const body = await pipedreamJson(fetcher, 'https://api.pipedream.com/v1/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clean(config?.client_id, 1000),
      client_secret: clean(config?.client_secret, 2000),
    }),
    signal: options.signal,
  }, 'PIPEDREAM_AUTH_FAILED');
  const accessToken = clean(body?.access_token, 10000);
  if (!accessToken) {
    const error = new Error('PIPEDREAM_ACCESS_TOKEN_MISSING');
    error.code = 'PIPEDREAM_ACCESS_TOKEN_MISSING';
    error.status = 502;
    throw error;
  }
  return accessToken;
}

export async function testPipedreamCredentials(config, options = {}) {
  const fetcher = options.fetcher || fetch;
  const token = await pipedreamAccessToken(config, { fetcher, signal: options.signal });
  const projectId = clean(config?.project_id, 300);
  const configuredEnvironment = configuredPipedreamEnvironment(config);
  let lastError = null;

  for (const environment of pipedreamEnvironmentCandidates(config)) {
    try {
      const checks = {};
      for (const app of ['microsoft_outlook', 'microsoft_onedrive']) {
        const url = 'https://api.pipedream.com/v1/connect/' + encodeURIComponent(projectId)
          + '/components?app=' + encodeURIComponent(app) + '&component_type=action';
        const body = await pipedreamJson(fetcher, url, {
          method: 'GET',
          headers: {
            authorization: 'Bearer ' + token,
            accept: 'application/json',
            'x-pd-environment': environment,
          },
          signal: options.signal,
        }, 'PIPEDREAM_PROJECT_TEST_FAILED');
        const components = Array.isArray(body?.data) ? body.data
          : Array.isArray(body?.components) ? body.components
            : Array.isArray(body) ? body : [];
        checks[app] = { reachable: true, component_count: components.length };
      }
      return {
        ok: true,
        provider: 'pipedream',
        authenticated: true,
        project_id: projectId,
        configured_environment: configuredEnvironment,
        environment,
        environment_fallback_used: environment !== configuredEnvironment,
        apps: checks,
      };
    } catch (error) {
      lastError = error;
      if (!canFallbackPipedreamEnvironment(error, environment)) throw error;
    }
  }
  throw lastError || Object.assign(new Error('PIPEDREAM_PROJECT_TEST_FAILED'), { code: 'PIPEDREAM_PROJECT_TEST_FAILED', status: 502 });
}

async function createPipedreamUserToken(stored, contextOwner, requestUrl, signal, app = '') {
  const configuredEnvironment = configuredPipedreamEnvironment(stored);
  const accessToken = await pipedreamAccessToken(stored, { signal });
  const success = new URL('/professor', requestUrl.origin);
  success.searchParams.set('view', 'connections');
  success.searchParams.set('pd', 'connected');
  if (app) success.searchParams.set('app', app);
  const failure = new URL('/professor', requestUrl.origin);
  failure.searchParams.set('view', 'connections');
  failure.searchParams.set('pd', 'error');
  if (app) failure.searchParams.set('app', app);

  let lastError = null;
  for (const environment of pipedreamEnvironmentCandidates(stored)) {
    try {
      const tokenBody = await pipedreamJson(fetch, 'https://api.pipedream.com/v1/connect/' + encodeURIComponent(stored.project_id) + '/tokens', {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + accessToken,
          'content-type': 'application/json',
          accept: 'application/json',
          'x-pd-environment': environment,
        },
        body: JSON.stringify({
          external_user_id: contextOwner,
          external_id: contextOwner,
          allowed_origins: [requestUrl.origin],
          success_redirect_uri: success.toString(),
          error_redirect_uri: failure.toString(),
        }),
        signal,
      }, 'PIPEDREAM_CONNECT_TOKEN_FAILED');
      const connectToken = clean(tokenBody?.token, 1000);
      if (!connectToken) {
        const error = new Error('PIPEDREAM_CONNECT_TOKEN_MISSING');
        error.code = 'PIPEDREAM_CONNECT_TOKEN_MISSING';
        error.status = 502;
        throw error;
      }
      return {
        tokenBody,
        connectToken,
        configured_environment: configuredEnvironment,
        environment,
        environment_fallback_used: environment !== configuredEnvironment,
      };
    } catch (error) {
      lastError = error;
      if (!canFallbackPipedreamEnvironment(error, environment)) throw error;
    }
  }
  throw lastError || Object.assign(new Error('PIPEDREAM_CONNECT_TOKEN_FAILED'), { code: 'PIPEDREAM_CONNECT_TOKEN_FAILED', status: 502 });
}

async function createPipedreamConnectLink(env, contextOwner, body, requestUrl, signal) {
  const stored = await pipedreamStoredConfig(env, contextOwner);
  if (!stored?.project_id || !stored?.client_id || !stored?.client_secret) {
    const error = new Error('PIPEDREAM_NOT_CONFIGURED');
    error.code = 'PIPEDREAM_NOT_CONFIGURED';
    error.status = 409;
    throw error;
  }
  const app = clean(body?.app, 120);
  if (!PIPEDREAM_ALLOWED_APPS.has(app)) {
    const error = new Error('PIPEDREAM_APP_UNSUPPORTED');
    error.code = 'PIPEDREAM_APP_UNSUPPORTED';
    error.status = 400;
    throw error;
  }
  const { tokenBody, environment, configured_environment, environment_fallback_used } = await createPipedreamUserToken(stored, contextOwner, requestUrl, signal, app);
  const rawLink = clean(tokenBody?.connect_link_url || tokenBody?.connectLinkUrl, 4000);
  if (!rawLink) {
    const error = new Error('PIPEDREAM_CONNECT_LINK_MISSING');
    error.code = 'PIPEDREAM_CONNECT_LINK_MISSING';
    error.status = 502;
    throw error;
  }
  let link;
  try {
    link = new URL(rawLink);
  } catch {
    const error = new Error('PIPEDREAM_CONNECT_LINK_INVALID');
    error.code = 'PIPEDREAM_CONNECT_LINK_INVALID';
    error.status = 502;
    throw error;
  }
  link.searchParams.set('app', app);
  return {
    ok: true,
    provider: 'pipedream',
    app,
    connect_link_url: link.toString(),
    configured_environment,
    environment,
    environment_fallback_used,
    expires_at: clean(tokenBody?.expires_at || tokenBody?.expiresAt, 200) || null,
  };
}

export async function pipedreamAccountStatus(config, contextOwner, options = {}) {
  const fetcher = options.fetcher || fetch;
  const configuredEnvironment = configuredPipedreamEnvironment(config);
  const projectId = clean(config?.project_id, 300);
  const accessToken = clean(options.accessToken, 10000)
    || await pipedreamAccessToken(config, { fetcher, signal: options.signal });
  const params = new URLSearchParams({ external_user_id: contextOwner, limit: '100' });
  let lastError = null;

  for (const environment of pipedreamEnvironmentCandidates(config)) {
    try {
      const body = await pipedreamJson(
        fetcher,
        'https://api.pipedream.com/v1/connect/' + encodeURIComponent(projectId) + '/accounts?' + params.toString(),
        {
          method: 'GET',
          headers: {
            authorization: 'Bearer ' + accessToken,
            accept: 'application/json',
            'x-pd-environment': environment,
          },
          signal: options.signal,
        },
        'PIPEDREAM_ACCOUNTS_FAILED',
      );
      const rows = Array.isArray(body?.data) ? body.data
        : Array.isArray(body?.accounts) ? body.accounts
          : Array.isArray(body) ? body : [];
      const accounts = rows.map(row => ({
        id: clean(row?.id, 300),
        app: clean(row?.app?.name_slug || row?.app?.nameSlug || row?.app, 160),
        name: clean(row?.name || row?.external_id, 300),
        healthy: row?.healthy !== false && row?.dead !== true && !row?.error,
      })).filter(row => row.id && row.app);
      return {
        ok: true,
        provider: 'pipedream',
        project_id: projectId,
        configured_environment: configuredEnvironment,
        environment,
        environment_fallback_used: environment !== configuredEnvironment,
        accounts,
        connected_apps: [...new Set(accounts.filter(row => row.healthy).map(row => row.app))],
      };
    } catch (error) {
      lastError = error;
      if (!canFallbackPipedreamEnvironment(error, environment)) throw error;
    }
  }
  throw lastError || Object.assign(new Error('PIPEDREAM_ACCOUNTS_FAILED'), { code: 'PIPEDREAM_ACCOUNTS_FAILED', status: 502 });
}

async function pipedreamAccounts(env, contextOwner, requestUrl, signal) {
  const stored = await pipedreamStoredConfig(env, contextOwner);
  if (!stored?.project_id || !stored?.client_id || !stored?.client_secret) {
    const error = new Error('PIPEDREAM_NOT_CONFIGURED');
    error.code = 'PIPEDREAM_NOT_CONFIGURED';
    error.status = 409;
    throw error;
  }
  try {
    return await pipedreamAccountStatus(stored, contextOwner, { signal });
  } catch (error) {
    if (error?.code !== 'PIPEDREAM_ACCOUNTS_FAILED') throw error;
    const auth = await testPipedreamCredentials(stored, { signal });
    return {
      ok: true,
      provider: 'pipedream',
      project_id: clean(stored.project_id, 300),
      accounts: [],
      connected_apps: [],
      account_status_available: false,
      account_status_degraded: true,
      authenticated: auth.authenticated === true,
      configured_environment: auth.configured_environment,
      environment: auth.environment,
      environment_fallback_used: auth.environment_fallback_used === true,
      connect_link_supported: true,
      actions_supported: true,
      proxy_supported: true,
    };
  }
}

export async function testPipedreamGoogleTasksRead(config, contextOwner, options = {}) {
  const fetcher = options.fetcher || fetch;
  const projectId = clean(config?.project_id, 300);
  const accounts = await pipedreamAccountStatus(config, contextOwner, {
    fetcher,
    signal: options.signal,
  });
  const environment = accounts.environment || configuredPipedreamEnvironment(config);
  const account = accounts.accounts.find(row => row.app === 'google_tasks' && row.healthy === true);
  if (!account?.id) {
    const error = new Error('PIPEDREAM_GOOGLE_TASKS_ACCOUNT_REQUIRED');
    error.code = 'PIPEDREAM_GOOGLE_TASKS_ACCOUNT_REQUIRED';
    error.status = 409;
    throw error;
  }

  const accessToken = await pipedreamAccessToken(config, { fetcher, signal: options.signal });
  const actionId = 'google_tasks-list-task-lists';
  let transport = 'action';
  try {
    await pipedreamJson(fetcher, 'https://api.pipedream.com/v1/connect/' + encodeURIComponent(projectId) + '/actions/run', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + accessToken,
        'content-type': 'application/json',
        accept: 'application/json',
        'x-pd-environment': environment,
      },
      body: JSON.stringify({
        external_user_id: contextOwner,
        id: actionId,
        configured_props: {
          app: { authProvisionId: account.id },
          maxResults: 1,
        },
      }),
      signal: options.signal,
    }, 'PIPEDREAM_GOOGLE_TASKS_READ_FAILED');
  } catch {
    // The pre-built action can temporarily reject a healthy managed account
    // even though the Connect API proxy can still authenticate it. Prove a
    // real read-only Google Tasks request through the same linked account.
    const target = 'https://www.googleapis.com/tasks/v1/users/@me/lists?maxResults=1';
    const params = new URLSearchParams({
      external_user_id: contextOwner,
      account_id: account.id,
    });
    await pipedreamJson(
      fetcher,
      'https://api.pipedream.com/v1/connect/' + encodeURIComponent(projectId)
        + '/proxy/' + b64UrlUtf8(target) + '?' + params.toString(),
      {
        method: 'GET',
        headers: {
          authorization: 'Bearer ' + accessToken,
          accept: 'application/json',
          'x-pd-environment': environment,
        },
        signal: options.signal,
      },
      'PIPEDREAM_GOOGLE_TASKS_PROXY_READ_FAILED',
    );
    transport = 'proxy';
  }

  return {
    ok: true,
    provider: 'pipedream',
    app: 'google_tasks',
    action_id: actionId,
    transport,
    live_action: transport === 'action',
    live_proxy: transport === 'proxy',
    read_only: true,
    account_connected: true,
    private_content_returned: false,
  };
}

async function vercelStatus(env, contextOwner) {
  const cfg = await createVercelConfigResolver(env)(contextOwner);
  return {
    provider: 'vercel',
    configured: Boolean(cfg.token),
    token_present: Boolean(cfg.token),
    team_id: clean(cfg.team_id, 200) || null,
    project_id: clean(cfg.project_id, 200) || null,
    project_name: clean(cfg.project_name, 200) || null,
    target_configured: Boolean(cfg.project_id && cfg.project_name),
    stored_securely: true,
    source: cfg.source || null,
  };
}

async function vercelJson(url, token, signal, code) {
  let response;
  try {
    response = await fetch(url, {
      headers: { authorization: 'Bearer ' + token, accept: 'application/json' },
      redirect: 'manual',
      signal: signal || AbortSignal.timeout(12_000),
    });
  } catch {
    const error = new Error(code);
    error.code = code;
    error.status = 503;
    throw error;
  }
  if (!response.ok) {
    await response.body?.cancel?.();
    const error = new Error(response.status === 401 || response.status === 403 ? code + '_AUTH' : code);
    error.code = response.status === 401 || response.status === 403 ? code + '_AUTH' : code;
    error.status = response.status === 401 || response.status === 403 ? 409 : 502;
    throw error;
  }
  try {
    return await response.json();
  } catch {
    const error = new Error(code + '_INVALID_RESPONSE');
    error.code = code + '_INVALID_RESPONSE';
    error.status = 502;
    throw error;
  }
}

async function testVercelConnection(env, contextOwner, signal) {
  const cfg = await createVercelConfigResolver(env)(contextOwner);
  if (!cfg.token) {
    const error = new Error('VERCEL_TOKEN_REQUIRED');
    error.code = 'VERCEL_TOKEN_REQUIRED';
    error.status = 409;
    throw error;
  }
  const user = await vercelJson('https://api.vercel.com/v2/user', cfg.token, signal, 'VERCEL_AUTH_TEST_FAILED');
  const params = new URLSearchParams({ limit: '50' });
  if (cfg.team_id) params.set('teamId', cfg.team_id);
  const projectsBody = await vercelJson('https://api.vercel.com/v9/projects?' + params.toString(), cfg.token, signal, 'VERCEL_PROJECTS_TEST_FAILED');
  const projects = (Array.isArray(projectsBody?.projects) ? projectsBody.projects : []).slice(0, 50).map(row => ({
    id: clean(row?.id, 200),
    name: clean(row?.name, 200),
    framework: clean(row?.framework, 100),
    updated_at: Number(row?.updatedAt || 0),
  })).filter(row => row.id && row.name);

  let project = projects.find(row => row.id === cfg.project_id)
    || projects.find(row => row.name === cfg.project_name)
    || null;
  if (!project) {
    const repositoryProjectName = clean(env.MEL_GITHUB_REPOSITORY, 300).split('/').filter(Boolean).at(-1) || '';
    if (repositoryProjectName) project = projects.find(row => row.name === repositoryProjectName) || null;
  }
  if (!project && projects.length === 1) project = projects[0];

  if (project?.id && project?.name && (!cfg.project_id || !cfg.project_name)) {
    await saveVercelConnectionConfig(env, {
      team_id: cfg.team_id,
      project_id: project.id,
      project_name: project.name,
    }, contextOwner);
  }

  let deployments = [];
  if (project?.id) {
    const dp = new URLSearchParams({ projectId: project.id, limit: '10' });
    if (cfg.team_id) dp.set('teamId', cfg.team_id);
    const deploymentsBody = await vercelJson('https://api.vercel.com/v6/deployments?' + dp.toString(), cfg.token, signal, 'VERCEL_DEPLOYMENTS_TEST_FAILED');
    deployments = (Array.isArray(deploymentsBody?.deployments) ? deploymentsBody.deployments : []).slice(0, 10).map(row => ({
      id: clean(row?.uid || row?.id, 200),
      name: clean(row?.name, 200),
      url: clean(row?.url, 500),
      state: clean(row?.state || row?.readyState, 80),
      target: clean(row?.target, 80),
      created_at: Number(row?.createdAt || row?.created || 0),
    })).filter(row => row.id);
  }

  return {
    ok: true,
    provider: 'vercel',
    authenticated: Boolean(user?.user?.id),
    user_id_present: Boolean(user?.user?.id),
    configured_project: project,
    projects,
    project_count: projects.length,
    deployments,
    deployment_count: deployments.length,
    target_ready: Boolean(project?.id && project?.name),
  };
}

async function saveOAuthApp(env, provider, contextOwner, body) {
  const clientId = clean(body.client_id, 1000);
  const clientSecret = clean(body.client_secret, 2000);
  if (!clientId || !clientSecret) {
    const error = new Error('OAUTH_APP_CREDENTIALS_REQUIRED');
    error.code = 'OAUTH_APP_CREDENTIALS_REQUIRED';
    error.status = 400;
    throw error;
  }
  const cfg = appKey(provider);
  const vaults = createD1OAuthVaults(env);
  await vaults.tokenVault.put({
    owner: contextOwner,
    connector_id: cfg.id,
    token_set: {
      kind: 'oauth-app-credentials',
      provider,
      client_id: clientId,
      client_secret: clientSecret,
      updated_at: Date.now(),
    },
  });
  return oauthStatus(env, provider, contextOwner);
}

async function bodyObject(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) return {};
  const value = await request.json().catch(() => ({}));
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export async function maybeHandleConnectionSettingsApi(request, env = {}, url = new URL(request.url)) {
  const match = url.pathname.match(/^\/api\/gen2\/connections\/(google|microsoft|yahoo|yahoo-imap|vercel|pipedream)\/(status|save|test|link|accounts)$/);
  if (!match) return null;
  const provider = match[1];
  const action = match[2];
  if (!PROVIDERS.has(provider)) return json({ ok: false, code: 'CONNECTION_PROVIDER_UNSUPPORTED' }, 404);
  const contextOwner = owner(env);

  try {
    if (action === 'status') {
      if (request.method !== 'GET') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
      const result = provider === 'yahoo-imap'
        ? await yahooDirectStatus(env, contextOwner)
          : provider === 'vercel'
            ? await vercelStatus(env, contextOwner)
            : provider === 'pipedream'
              ? await pipedreamStatus(env, contextOwner)
              : await oauthStatus(env, provider, contextOwner);
      return json({ ok: true, ...result });
    }

    if (action === 'save') {
      if (request.method !== 'POST') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
      const body = await bodyObject(request);
      const result = provider === 'yahoo-imap'
        ? await saveYahooDirect(env, contextOwner, body)
          : provider === 'vercel'
            ? await saveVercelConnectionConfig(env, body, contextOwner)
            : provider === 'pipedream'
              ? await savePipedreamConfig(env, contextOwner, body)
              : await saveOAuthApp(env, provider, contextOwner, body);
      return json({ ok: true, ...result });
    }

    if (action === 'link') {
      if (request.method !== 'POST') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
      if (provider !== 'pipedream') return json({ ok: false, code: 'CONNECTION_ACTION_UNSUPPORTED' }, 404);
      const body = await bodyObject(request);
      return json(await createPipedreamConnectLink(env, contextOwner, body, url, request.signal));
    }

    if (action === 'accounts') {
      if (request.method !== 'GET') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
      if (provider !== 'pipedream') return json({ ok: false, code: 'CONNECTION_ACTION_UNSUPPORTED' }, 404);
      return json(await pipedreamAccounts(env, contextOwner, url, request.signal));
    }

    if (action === 'test') {
      if (request.method !== 'POST') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
      if (provider === 'yahoo-imap') {
        const vaults = createD1OAuthVaults(env);
        const stored = await vaults.tokenVault.get({ owner: contextOwner, connector_id: 'yahoo-imap-smtp' });
        if (!stored) return json({ ok: false, code: 'YAHOO_IMAP_NOT_CONFIGURED' }, 409);
        const result = await probeYahooDirect(stored);
        if (Number(stored.smtp_port) !== result.smtp_port || stored.smtp_security !== result.smtp_security) {
          await vaults.tokenVault.put({
            owner: contextOwner,
            connector_id: 'yahoo-imap-smtp',
            token_set: {
              ...stored,
              smtp_port: result.smtp_port,
              smtp_security: result.smtp_security,
              updated_at: Date.now(),
            },
          });
        }
        return json({ ok: true, provider, imap: result.imap, smtp: result.smtp, persistent: true, smtp_fallback: result.smtp_port === 587 });
      }
      if (provider === 'vercel') {
        return json(await testVercelConnection(env, contextOwner, request.signal));
      }
      if (provider === 'pipedream') {
        const stored = await pipedreamStoredConfig(env, contextOwner);
        if (!stored) return json({ ok: false, code: 'PIPEDREAM_NOT_CONFIGURED' }, 409);
        const body = await bodyObject(request);
        if (clean(body?.probe, 120) === 'google_tasks_read') {
          return json(await testPipedreamGoogleTasksRead(stored, contextOwner, { signal: request.signal }));
        }
        return json(await testPipedreamCredentials(stored, { signal: request.signal }));
      }
      const body = await bodyObject(request);
      const connectorId = clean(body.connector_id, 160);
      if (!PROVIDER_CONNECTORS[provider]?.includes(connectorId)) return json({ ok: false, code: 'CONNECTION_CONNECTOR_UNSUPPORTED' }, 404);
      return json(await testOAuthConnector(env, provider, connectorId, contextOwner, request.signal));
    }

    return json({ ok: false, code: 'NOT_FOUND' }, 404);
  } catch (error) {
    const code=clean(error?.code || 'CONNECTION_OPERATION_FAILED',160);
    const inferredAction = code==='OAUTH_VAULT_LEGACY_KEY_UNAVAILABLE_RECONNECT_REQUIRED'
      ? (provider==='google' ? 'RECONNECT_GOOGLE' : provider==='microsoft' ? 'RECONNECT_MICROSOFT' : provider==='yahoo' ? 'RECONNECT_YAHOO' : 'RECONNECT_CONNECTION')
      : '';
    return json({
      ok: false,
      error: clean(error?.code || error?.message || 'CONNECTION_OPERATION_FAILED', 160),
      code,
      ...(Number.isFinite(Number(error?.upstream_status)) ? { upstream_status: Number(error.upstream_status) } : {}),
      ...(clean(error?.action_required || inferredAction, 160) ? { action_required: clean(error?.action_required || inferredAction, 160) } : {}),
    }, Number(error?.status) || 500);
  }
}

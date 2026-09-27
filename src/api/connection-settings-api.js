import { createD1OAuthVaults } from '../connectors/d1-oauth-vault.js';
import { createGoogleOAuthRuntime } from '../connectors/google-oauth-runtime.js';
import { createMailOAuthRuntime } from '../connectors/mail-oauth-runtime.js';
import { createVercelConfigResolver, saveVercelConnectionConfig } from '../connectors/vercel-config.js';

const PROVIDERS = new Set(['google','microsoft','yahoo','roundcube','vercel']);
const OAUTH_APP_KEYS = Object.freeze({
  google: Object.freeze({ id: 'oauth-app-google', clientIdEnv: 'GOOGLE_OAUTH_CLIENT_ID', clientSecretEnv: 'GOOGLE_OAUTH_CLIENT_SECRET' }),
  microsoft: Object.freeze({ id: 'oauth-app-microsoft', clientIdEnv: 'MICROSOFT_OAUTH_CLIENT_ID', clientSecretEnv: 'MICROSOFT_OAUTH_CLIENT_SECRET' }),
  yahoo: Object.freeze({ id: 'oauth-app-yahoo', clientIdEnv: 'YAHOO_OAUTH_CLIENT_ID', clientSecretEnv: 'YAHOO_OAUTH_CLIENT_SECRET' }),
});
const PROVIDER_CONNECTORS = Object.freeze({
  google: Object.freeze(['gmail']),
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
  return timeoutRead(reader, text => new RegExp('(?:^|\\r\\n)' + String(code) + ' ').test(text));
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
    connectors[connectorId] = await runtime.status(connectorId, { owner: contextOwner });
  }
  return {
    provider,
    app_configured: appConfigured,
    client_id_present: Boolean(clean(resolved[cfg.clientIdEnv], 1000)),
    client_secret_present: Boolean(clean(resolved[cfg.clientSecretEnv], 2000)),
    connectors,
  };
}

async function testOAuthConnector(env, provider, connectorId, contextOwner, signal) {
  const resolved = await resolveConnectionOAuthEnv(env, provider, contextOwner);
  const context = { owner: contextOwner, signal };
  let token = '';
  let url = '';
  if (provider === 'google' && connectorId === 'gmail') {
    token = await createGoogleOAuthRuntime({ env: resolved }).accessTokenResolver('gmail', context);
    url = 'https://gmail.googleapis.com/gmail/v1/users/me/profile';
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
    redirect: 'error',
    signal: signal || AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    await response.body?.cancel?.();
    const error = new Error('CONNECTION_LIVE_PROBE_FAILED');
    error.code = 'CONNECTION_LIVE_PROBE_FAILED';
    error.status = response.status === 401 || response.status === 403 ? 409 : 502;
    throw error;
  }
  await response.body?.cancel?.();
  return { ok: true, provider, connector_id: connectorId, live_probe: true };
}

async function roundcubeStatus(env, contextOwner) {
  const vaults = createD1OAuthVaults(env);
  const stored = await vaults.tokenVault.get({ owner: contextOwner, connector_id: 'generic-imap-smtp' });
  if (!stored) return { provider: 'roundcube', configured: false, stored_securely: true };
  return {
    provider: 'roundcube',
    configured: true,
    stored_securely: true,
    imap_host: clean(stored.imap_host, 255),
    imap_port: Number(stored.imap_port) || 993,
    imap_security: stored.imap_security === 'starttls' ? 'starttls' : 'tls',
    smtp_host: clean(stored.smtp_host, 255),
    smtp_port: Number(stored.smtp_port) || 465,
    smtp_security: stored.smtp_security === 'starttls' ? 'starttls' : 'tls',
    username: clean(stored.username, 320),
    password_present: Boolean(clean(stored.password, 4000)),
  };
}

async function saveRoundcube(env, contextOwner, body) {
  const imapHost = clean(body.imap_host, 255);
  const smtpHost = clean(body.smtp_host, 255);
  const username = clean(body.username, 320);
  const password = clean(body.password, 4000);
  const imapPort = port(body.imap_port, 993);
  const smtpPort = port(body.smtp_port, 465);
  const imapSecurity = body.imap_security === 'starttls' ? 'starttls' : 'tls';
  const smtpSecurity = body.smtp_security === 'starttls' ? 'starttls' : 'tls';
  if (!isHost(imapHost) || !isHost(smtpHost) || !username || !password || !imapPort || !smtpPort) {
    const error = new Error('ROUNDCUBE_CONFIGURATION_INVALID');
    error.code = 'ROUNDCUBE_CONFIGURATION_INVALID';
    error.status = 400;
    throw error;
  }
  const vaults = createD1OAuthVaults(env);
  await vaults.tokenVault.put({
    owner: contextOwner,
    connector_id: 'generic-imap-smtp',
    token_set: {
      kind: 'imap-smtp-credentials',
      imap_host: imapHost,
      imap_port: imapPort,
      imap_security: imapSecurity,
      smtp_host: smtpHost,
      smtp_port: smtpPort,
      smtp_security: smtpSecurity,
      username,
      password,
      updated_at: Date.now(),
    },
  });
  return roundcubeStatus(env, contextOwner);
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
      redirect: 'error',
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
  if (!project && projects.length === 1) project = projects[0];

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
  const match = url.pathname.match(/^\/api\/gen2\/connections\/(google|microsoft|yahoo|roundcube|vercel)\/(status|save|test)$/);
  if (!match) return null;
  const provider = match[1];
  const action = match[2];
  if (!PROVIDERS.has(provider)) return json({ ok: false, code: 'CONNECTION_PROVIDER_UNSUPPORTED' }, 404);
  const contextOwner = owner(env);

  try {
    if (action === 'status') {
      if (request.method !== 'GET') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
      const result = provider === 'roundcube'
        ? await roundcubeStatus(env, contextOwner)
        : provider === 'vercel'
          ? await vercelStatus(env, contextOwner)
          : await oauthStatus(env, provider, contextOwner);
      return json({ ok: true, ...result });
    }

    if (action === 'save') {
      if (request.method !== 'POST') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
      const body = await bodyObject(request);
      const result = provider === 'roundcube'
        ? await saveRoundcube(env, contextOwner, body)
        : provider === 'vercel'
          ? await saveVercelConnectionConfig(env, body, contextOwner)
          : await saveOAuthApp(env, provider, contextOwner, body);
      return json({ ok: true, ...result });
    }

    if (action === 'test') {
      if (request.method !== 'POST') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
      if (provider === 'roundcube') {
        const vaults = createD1OAuthVaults(env);
        const stored = await vaults.tokenVault.get({ owner: contextOwner, connector_id: 'generic-imap-smtp' });
        if (!stored) return json({ ok: false, code: 'ROUNDCUBE_NOT_CONFIGURED' }, 409);
        const [imap, smtp] = await Promise.all([imapAuthProbe(stored), smtpAuthProbe(stored)]);
        return json({ ok: true, provider, imap, smtp, persistent: true });
      }
      if (provider === 'vercel') {
        return json(await testVercelConnection(env, contextOwner, request.signal));
      }
      const body = await bodyObject(request);
      const connectorId = clean(body.connector_id, 160);
      if (!PROVIDER_CONNECTORS[provider]?.includes(connectorId)) return json({ ok: false, code: 'CONNECTION_CONNECTOR_UNSUPPORTED' }, 404);
      return json(await testOAuthConnector(env, provider, connectorId, contextOwner, request.signal));
    }

    return json({ ok: false, code: 'NOT_FOUND' }, 404);
  } catch (error) {
    return json({
      ok: false,
      error: clean(error?.code || error?.message || 'CONNECTION_OPERATION_FAILED', 160),
      code: clean(error?.code || 'CONNECTION_OPERATION_FAILED', 160),
    }, Number(error?.status) || 500);
  }
}

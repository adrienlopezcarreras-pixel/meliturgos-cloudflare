import { BROWSER_ACTIONS, BROWSER_CAPABILITY_SCHEMA } from './browser-capability.js';

export const BROWSER_COMPANION_SCHEMA = 'mel.devices.browser-companion.v1';

const DEFAULT_ENDPOINT = 'https://browser-companion.internal';
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_TIMEOUT_MS = 15000;
const MAX_RESPONSE_BYTES = 131072;
const ACTIONS = new Set(Object.values(BROWSER_ACTIONS));

function boundedText(value, max = 120) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function browserCompanionError(code, status = 502) {
  const normalized = boundedText(code, 120) || 'BROWSER_COMPANION_FAILURE';
  const error = new Error(normalized);
  error.name = 'BrowserCompanionError';
  error.code = normalized;
  error.status = status;
  return error;
}

function normalizeEndpoint(value) {
  try {
    const url = new URL(String(value || DEFAULT_ENDPOINT));
    if (url.protocol !== 'https:') throw new Error('HTTPS_REQUIRED');
    url.username = '';
    url.password = '';
    url.pathname = url.pathname.replace(/\/$/, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    throw browserCompanionError('BROWSER_COMPANION_ENDPOINT_INVALID', 500);
  }
}

function normalizeTimeout(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(250, Math.trunc(parsed)));
}

function normalizeOrigins(value) {
  if (!Array.isArray(value)) return [];
  const origins = [];
  for (const item of value) {
    try {
      const url = new URL(String(item || ''));
      if (url.protocol === 'https:' && !origins.includes(url.origin)) origins.push(url.origin);
    } catch {
      // Invalid origins are ignored; browser-capability already fails closed.
    }
  }
  return origins.slice(0, 64);
}

function assertStepOrigin(step, allowedOrigins) {
  if (!step?.url) return;
  let origin = '';
  try {
    const url = new URL(step.url);
    if (url.protocol === 'https:') origin = url.origin;
  } catch {
    // handled below
  }
  if (!origin || !allowedOrigins.includes(origin)) {
    throw browserCompanionError('ORIGIN_OUTSIDE_SANDBOX', 403);
  }
}

async function boundedJson(response) {
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_RESPONSE_BYTES) {
    throw browserCompanionError('BROWSER_COMPANION_RESPONSE_TOO_LARGE');
  }
  const text = new TextDecoder().decode(buffer);
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('OBJECT_REQUIRED');
    }
    return parsed;
  } catch {
    throw browserCompanionError('BROWSER_COMPANION_INVALID_JSON');
  }
}

export function isBrowserCompanionBinding(binding) {
  return Boolean(binding && typeof binding.fetch === 'function');
}

/**
 * Concrete GEN2-31 transport for a separately deployed browser companion.
 * The service binding is explicit: without it the capability stays unavailable.
 * No public browser vendor, credential or paid provider is selected implicitly.
 */
export function createBrowserCompanionAdapter({
  binding,
  endpoint = DEFAULT_ENDPOINT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!isBrowserCompanionBinding(binding)) {
    throw browserCompanionError('BROWSER_COMPANION_BINDING_REQUIRED', 503);
  }

  const baseUrl = normalizeEndpoint(endpoint);
  const timeout = normalizeTimeout(timeoutMs);

  async function request(path, init = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await binding.fetch(new Request(`${baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      }));
    } catch (error) {
      if (error?.name === 'AbortError') throw browserCompanionError('BROWSER_COMPANION_TIMEOUT', 504);
      throw browserCompanionError('BROWSER_COMPANION_UNREACHABLE', 503);
    } finally {
      clearTimeout(timer);
    }
  }

  return Object.freeze({
    schema: BROWSER_COMPANION_SCHEMA,

    async health() {
      try {
        const response = await request('/health', { method: 'GET' });
        return response.ok ? 'ONLINE' : 'DEGRADED';
      } catch {
        return 'OFFLINE';
      }
    },

    async perform(step = {}, context = {}) {
      const action = boundedText(step.action, 160);
      const sessionId = boundedText(context.sessionId, 200);
      const deviceId = boundedText(context.deviceId, 200);
      if (!ACTIONS.has(action)) throw browserCompanionError('ACTION_NOT_ALLOWED', 403);
      if (!sessionId || !deviceId) throw browserCompanionError('SESSION_AND_DEVICE_REQUIRED', 400);

      const allowedOrigins = normalizeOrigins(context.allowedOrigins);
      if (allowedOrigins.length === 0) throw browserCompanionError('BROWSER_ALLOWED_ORIGINS_REQUIRED', 400);
      assertStepOrigin(step, allowedOrigins);

      const response = await request('/v1/browser/perform', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          schema: BROWSER_CAPABILITY_SCHEMA,
          session_id: sessionId,
          device_id: deviceId,
          step,
          sandbox: { allowed_origins: allowedOrigins },
        }),
      });

      const body = await boundedJson(response);
      if (!response.ok) {
        throw browserCompanionError(body.code || `BROWSER_COMPANION_HTTP_${response.status}`, response.status);
      }
      if (body.ok === false) throw browserCompanionError(body.code || 'BROWSER_COMPANION_REJECTED', 502);
      return body.result ?? body.output ?? null;
    },
  });
}

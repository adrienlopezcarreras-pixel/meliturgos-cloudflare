import { BROWSER_ACTIONS, BROWSER_CAPABILITY_SCHEMA } from '../../src/devices/browser-capability.js';

export const BROWSER_COMPANION_SCHEMA = 'mel.devices.browser-companion.v1';
export const MAX_COMPANION_ORIGINS = 50;
export const ACTION_TIMEOUT_MS = 7000;
export const MAX_READ_TEXT = 64000;
export const MAX_SCREENSHOT_BYTES = 80000;

const ACTIONS = new Set(Object.values(BROWSER_ACTIONS));

function clean(value, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function companionError(code, status = 500) {
  const error = new Error(clean(code, 120) || 'BROWSER_COMPANION_FAILURE');
  error.name = 'BrowserCompanionRuntimeError';
  error.code = clean(code, 120) || 'BROWSER_COMPANION_FAILURE';
  error.status = Number.isInteger(status) ? status : 500;
  return error;
}

function normalizeHttpsOrigin(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return '';
    return url.origin;
  } catch {
    return '';
  }
}

export function normalizeAllowedOrigins(value) {
  if (!Array.isArray(value)) return [];
  const origins = [];
  for (const item of value) {
    const origin = normalizeHttpsOrigin(item);
    if (origin && !origins.includes(origin)) origins.push(origin);
  }
  return origins.slice(0, MAX_COMPANION_ORIGINS);
}

export function allowedDomainsFromOrigins(origins) {
  const normalized = normalizeAllowedOrigins(origins);
  if (normalized.length === 0) throw companionError('BROWSER_ALLOWED_ORIGINS_REQUIRED', 400);
  return normalized.map(origin => new URL(origin).hostname.toLowerCase());
}

export function normalizeCompanionPayload(payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw companionError('BROWSER_COMPANION_REQUEST_INVALID', 400);
  }
  if (payload.schema !== BROWSER_CAPABILITY_SCHEMA) {
    throw companionError('BROWSER_COMPANION_SCHEMA_INVALID', 400);
  }

  const sessionId = clean(payload.session_id);
  const deviceId = clean(payload.device_id);
  const step = payload.step && typeof payload.step === 'object' && !Array.isArray(payload.step)
    ? payload.step
    : {};
  const action = clean(step.action, 160);
  const id = clean(step.id);

  if (!sessionId || !deviceId || !id) throw companionError('SESSION_AND_DEVICE_REQUIRED', 400);
  if (!ACTIONS.has(action)) throw companionError('ACTION_NOT_ALLOWED', 403);

  const allowedOrigins = normalizeAllowedOrigins(payload.sandbox?.allowed_origins);
  if (allowedOrigins.length === 0) throw companionError('BROWSER_ALLOWED_ORIGINS_REQUIRED', 400);
  if (Array.isArray(payload.sandbox?.allowed_origins)
      && payload.sandbox.allowed_origins.length > MAX_COMPANION_ORIGINS) {
    throw companionError('BROWSER_ALLOWED_ORIGINS_LIMIT', 400);
  }

  const url = clean(step.url, 4096);
  if (url) {
    const origin = normalizeHttpsOrigin(url);
    if (!origin) throw companionError('HTTPS_URL_REQUIRED', 400);
    if (!allowedOrigins.includes(origin)) throw companionError('ORIGIN_OUTSIDE_SANDBOX', 403);
  }

  return {
    schema: BROWSER_CAPABILITY_SCHEMA,
    session_id: sessionId,
    device_id: deviceId,
    sandbox: { allowed_origins: allowedOrigins },
    step: {
      id,
      action,
      url,
      selector: clean(step.selector, 1000),
      text: typeof step.text === 'string' ? step.text.slice(0, 8192) : '',
      delta_x: Number.isFinite(Number(step.delta_x)) ? Number(step.delta_x) : 0,
      delta_y: Number.isFinite(Number(step.delta_y)) ? Number(step.delta_y) : 0,
    },
  };
}

function requireSelector(step) {
  if (!step.selector) throw companionError('BROWSER_SELECTOR_REQUIRED', 400);
  return step.selector;
}

function assertCurrentOrigin(page, allowedOrigins) {
  const current = String(page.url?.() || '');
  if (!current || current === 'about:blank') return current;
  const origin = normalizeHttpsOrigin(current);
  if (!origin || !allowedOrigins.includes(origin)) {
    throw companionError('ORIGIN_OUTSIDE_SANDBOX', 403);
  }
  return current;
}

function screenshotBase64(bytes) {
  const buffer = Buffer.from(bytes);
  if (buffer.byteLength > MAX_SCREENSHOT_BYTES) {
    throw companionError('BROWSER_SCREENSHOT_TOO_LARGE', 413);
  }
  return buffer.toString('base64');
}

export async function executeBrowserStep(page, step, allowedOrigins) {
  if (!page || typeof page !== 'object') throw companionError('BROWSER_PAGE_REQUIRED', 500);
  if (!step || typeof step !== 'object') throw companionError('BROWSER_STEP_REQUIRED', 400);

  switch (step.action) {
    case BROWSER_ACTIONS.NAVIGATE: {
      if (!step.url) throw companionError('NAVIGATION_URL_REQUIRED', 400);
      const response = await page.goto(step.url, {
        waitUntil: 'domcontentloaded',
        timeout: ACTION_TIMEOUT_MS,
      });
      const url = assertCurrentOrigin(page, allowedOrigins);
      return {
        kind: 'navigation',
        url,
        title: String(await page.title()).slice(0, 1000),
        status: Number(response?.status?.() || 0) || null,
      };
    }

    case BROWSER_ACTIONS.READ_TEXT: {
      assertCurrentOrigin(page, allowedOrigins);
      const selector = step.selector || 'body';
      const text = String(await page.locator(selector).innerText({ timeout: ACTION_TIMEOUT_MS }));
      return {
        kind: 'text',
        selector,
        text: text.slice(0, MAX_READ_TEXT),
        truncated: text.length > MAX_READ_TEXT,
      };
    }

    case BROWSER_ACTIONS.SCREENSHOT: {
      assertCurrentOrigin(page, allowedOrigins);
      const bytes = await page.screenshot({
        type: 'jpeg',
        quality: 55,
        fullPage: false,
      });
      const base64 = screenshotBase64(bytes);
      return {
        kind: 'screenshot',
        mime_type: 'image/jpeg',
        bytes: Buffer.byteLength(Buffer.from(base64, 'base64')),
        base64,
      };
    }

    case BROWSER_ACTIONS.CLICK: {
      const selector = requireSelector(step);
      assertCurrentOrigin(page, allowedOrigins);
      await page.locator(selector).click({ timeout: ACTION_TIMEOUT_MS });
      await page.waitForLoadState?.('domcontentloaded', { timeout: 2500 }).catch(() => {});
      const url = assertCurrentOrigin(page, allowedOrigins);
      return {
        kind: 'interaction',
        action: step.action,
        selector,
        url,
        title: String(await page.title()).slice(0, 1000),
      };
    }

    case BROWSER_ACTIONS.SCROLL: {
      assertCurrentOrigin(page, allowedOrigins);
      await page.mouse.wheel(step.delta_x, step.delta_y);
      return {
        kind: 'interaction',
        action: step.action,
        delta_x: step.delta_x,
        delta_y: step.delta_y,
        url: String(page.url?.() || ''),
      };
    }

    case BROWSER_ACTIONS.TYPE: {
      const selector = requireSelector(step);
      assertCurrentOrigin(page, allowedOrigins);
      await page.locator(selector).fill(step.text, { timeout: ACTION_TIMEOUT_MS });
      return {
        kind: 'interaction',
        action: step.action,
        selector,
        characters: step.text.length,
        url: String(page.url?.() || ''),
      };
    }

    case BROWSER_ACTIONS.SUBMIT: {
      const selector = step.selector || 'form';
      assertCurrentOrigin(page, allowedOrigins);
      await page.locator(selector).evaluate(node => {
        const form = node?.tagName === 'FORM' ? node : node?.form;
        if (!form || typeof form.requestSubmit !== 'function') throw new Error('FORM_REQUIRED');
        form.requestSubmit();
      });
      await page.waitForLoadState?.('domcontentloaded', { timeout: ACTION_TIMEOUT_MS }).catch(() => {});
      const url = assertCurrentOrigin(page, allowedOrigins);
      return {
        kind: 'interaction',
        action: step.action,
        selector,
        url,
        title: String(await page.title()).slice(0, 1000),
      };
    }

    case BROWSER_ACTIONS.DOWNLOAD: {
      const selector = requireSelector(step);
      assertCurrentOrigin(page, allowedOrigins);
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: ACTION_TIMEOUT_MS }),
        page.locator(selector).click({ timeout: ACTION_TIMEOUT_MS }),
      ]);
      return {
        kind: 'download',
        selector,
        suggested_filename: clean(download?.suggestedFilename?.(), 1000),
        url: clean(download?.url?.(), 4096),
        failure: clean(await download?.failure?.(), 1000) || null,
      };
    }

    default:
      throw companionError('ACTION_NOT_ALLOWED', 403);
  }
}

export function successEnvelope(step, result) {
  return {
    schema: BROWSER_COMPANION_SCHEMA,
    ok: true,
    step_id: step.id,
    action: step.action,
    result,
  };
}

export function errorEnvelope(error) {
  return {
    schema: BROWSER_COMPANION_SCHEMA,
    ok: false,
    code: clean(error?.code || error?.name || 'BROWSER_COMPANION_FAILURE', 120) || 'BROWSER_COMPANION_FAILURE',
  };
}

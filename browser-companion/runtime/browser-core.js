import { BROWSER_ACTIONS, BROWSER_CAPABILITY_SCHEMA } from '../../src/devices/browser-capability.js';

export const BROWSER_COMPANION_SCHEMA = 'mel.devices.browser-companion.v1';
export const MAX_COMPANION_ORIGINS = 50;
export const ACTION_TIMEOUT_MS = 7000;
export const WAIT_TEXT_TIMEOUT_MS = 20000;
export const MAX_WAIT_TEXT_TIMEOUT_MS = 60000;
export const MAX_READ_TEXT = 64000;
export const MAX_SCREENSHOT_BYTES = 80000;

const ACTIONS = new Set(Object.values(BROWSER_ACTIONS));
const ALLOWED_REQUEST_HEADERS = new Set(['authorization','x-mel-release-smoke','x-mel-launch-bootstrap','x-mel-parallel-proof']);

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

function normalizeRequestHeaders(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [rawName, rawValue] of Object.entries(value)) {
    const name = String(rawName || '').trim().toLowerCase();
    if (!ALLOWED_REQUEST_HEADERS.has(name)) continue;
    const val = typeof rawValue === 'string' ? rawValue.trim().slice(0, 2048) : '';
    if (val) out[name] = val;
  }
  return out;
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
      file_name: clean(step.file_name, 200),
      mime_type: clean(step.mime_type, 120),
      file_text: typeof step.file_text === 'string' ? step.file_text.slice(0, 16384) : '',
      headers: normalizeRequestHeaders(step.headers),
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

    case BROWSER_ACTIONS.UPLOAD_FILE: {
      const selector = requireSelector(step);
      assertCurrentOrigin(page, allowedOrigins);
      const fileName = clean(step.file_name, 200);
      const mimeType = clean(step.mime_type, 120) || 'text/plain';
      if (!fileName || !step.file_text) throw companionError('BROWSER_UPLOAD_FILE_REQUIRED', 400);
      const bytes = Buffer.from(step.file_text, 'utf8');
      if (bytes.byteLength > 16384) throw companionError('BROWSER_UPLOAD_FILE_TOO_LARGE', 413);
      // Release-file proofs must establish the actual upload response, not just
      // that Playwright populated an input. Never return response body or headers.
      const releaseFileProof = /^mel-file-(normal|full)-proof\.txt$/i.test(fileName);
      if (releaseFileProof && typeof page.waitForResponse !== 'function') {
        throw companionError('BROWSER_UPLOAD_RESPONSE_OBSERVER_UNAVAILABLE', 503);
      }
      const uploadResponse = releaseFileProof && typeof page.waitForResponse === 'function'
        ? page.waitForResponse(response => {
            try {
              return new URL(response.url()).pathname === '/api/files/upload'
                && response.request().method() === 'POST';
            } catch { return false; }
          }, { timeout: 12000 }).then(async response => {
            // Prove that the real API acknowledged this exact file. Only retain
            // bounded diagnostic metadata; never expose the response payload.
            const status = response.status();
            let accepted = false;
            let code = '';
            try {
              const body = await response.json();
              accepted = body?.ok === true
                && typeof body?.id === 'string' && body.id.length > 0
                && body?.name === fileName;
              const rawCode = String(body?.code || '');
              if (/^[A-Z][A-Z0-9_]{2,79}$/.test(rawCode)) code = rawCode;
            } catch {}
            return { status, accepted, code };
          }).catch(() => null)
        : null;
      const input = page.locator(selector);
      // Professor's file input is `hidden` inside a display:none chat view.
      // Cloudflare Browser Rendering then keeps the proof file off the element
      // and does not emit change, so the real listener never POSTs. Reveal the
      // control first. A non-200 upload is still a hard failure below.
      if (typeof input.evaluate === 'function') {
        await input.evaluate(element => {
          if (!element) return;
          try { element.hidden = false; } catch { /* older DOM */ }
          if (typeof element.removeAttribute === 'function') element.removeAttribute('hidden');
          const style = element.style;
          if (style && typeof style.setProperty === 'function') {
            style.setProperty('display', 'block', 'important');
            style.setProperty('visibility', 'visible', 'important');
            style.setProperty('opacity', '1', 'important');
            style.setProperty('position', 'fixed', 'important');
            style.setProperty('inset', '0 auto auto 0', 'important');
            style.setProperty('width', '64px', 'important');
            style.setProperty('height', '24px', 'important');
            style.setProperty('z-index', '2147483646', 'important');
          }
          let node = element.parentElement;
          while (node) {
            if (node.classList && node.classList.contains('view') && typeof node.classList.add === 'function') {
              node.classList.add('active');
            }
            if (typeof node.removeAttribute === 'function' && node.hasAttribute && node.hasAttribute('hidden')) {
              node.removeAttribute('hidden');
            }
            node = node.parentElement;
          }
        }).catch(() => {});
      }
      const proofFile = { name: fileName, mimeType, buffer: bytes };
      // Cloudflare Browser Rendering never delivers a change event from the
      // hidden full-mode input, and its file chooser does not open. Call the
      // page's own upload function, which is what Joindre runs, and still
      // require the real /api/files/upload response below.
      let postedByPage = false;
      if (releaseFileProof && selector === '#chatFileInput' && typeof page.evaluate === 'function') {
        const nav = page.locator('#nav button[data-view="chat"]');
        if (nav && typeof nav.click === 'function') await nav.click({ timeout: 2000 }).catch(() => {});
        postedByPage = await page.evaluate(async payload => {
          if (!payload || typeof payload.text !== 'string') return false;
          document.querySelectorAll('.view').forEach(node => {
            if (node.classList) node.classList.toggle('active', node.getAttribute('data-panel') === 'chat');
          });
          const upload = window.melUploadChatFiles;
          if (typeof upload !== 'function') return false;
          const file = new File([payload.text], String(payload.name || 'upload.txt'), { type: payload.mime || 'text/plain' });
          await upload([file], 'file-picker');
          return true;
        }, { text: step.file_text, name: fileName, mime: mimeType }).catch(() => false);
      }
      if (!postedByPage) {
        await input.setInputFiles(proofFile, { timeout: ACTION_TIMEOUT_MS });
        if (releaseFileProof && typeof input.evaluate === 'function') {
          await input.evaluate((element, payload) => {
            if (!element) return;
            const missing = !element.files || element.files.length === 0;
            if (missing && payload && typeof payload.text === 'string'
              && typeof File === 'function' && typeof DataTransfer === 'function') {
              try {
                const file = new File([payload.text], String(payload.name || 'upload.txt'), { type: payload.mime || 'text/plain' });
                const transfer = new DataTransfer();
                transfer.items.add(file);
                element.files = transfer.files;
              } catch { /* the webdriver assignment already holds the file */ }
            }
            if (!element.files || element.files.length === 0 || typeof element.dispatchEvent !== 'function') return;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
          }, { text: step.file_text, name: fileName, mime: mimeType }).catch(() => {});
        }
      }
      const uploadOutcome = uploadResponse ? await uploadResponse : null;
      if (uploadResponse && (uploadOutcome?.status !== 200 || !uploadOutcome?.accepted)) {
        const status = uploadOutcome?.status || 408;
        const cause = !uploadOutcome ? 'BROWSER_UPLOAD_HTTP_NOT_OBSERVED'
          : status !== 200 ? 'BROWSER_UPLOAD_HTTP_' + status
          : 'BROWSER_UPLOAD_API_NOT_ACKNOWLEDGED';
        // Do not return untrusted server error strings or any upload contents.
        throw companionError(cause, status === 200 ? 502 : status);
      }
      return {
        kind: 'upload',
        action: step.action,
        selector,
        file_name: fileName,
        mime_type: mimeType,
        bytes: bytes.byteLength,
        url: String(page.url?.() || ''),
      };
    }

    case BROWSER_ACTIONS.SET_HEADERS: {
      const headers = normalizeRequestHeaders(step.headers);
      if (!Object.keys(headers).length) throw companionError('BROWSER_HEADERS_REQUIRED', 400);
      await page.setExtraHTTPHeaders(headers);
      return {
        kind: 'interaction',
        action: step.action,
        header_names: Object.keys(headers),
        url: String(page.url?.() || ''),
      };
    }

    case BROWSER_ACTIONS.WAIT_TEXT: {
      const selector = requireSelector(step);
      const expected = String(step.text || '');
      if (!expected) throw companionError('BROWSER_WAIT_TEXT_REQUIRED', 400);
      assertCurrentOrigin(page, allowedOrigins);
      const locator = page.locator(selector);
      const requestedTimeout=Number(step.timeout_ms||0);
      const waitTimeout=Number.isFinite(requestedTimeout)&&requestedTimeout>0
        ? Math.max(1000,Math.min(MAX_WAIT_TEXT_TIMEOUT_MS,Math.trunc(requestedTimeout)))
        : WAIT_TEXT_TIMEOUT_MS;
      const deadline = Date.now() + waitTimeout;
      let value = '';
      while (Date.now() < deadline) {
        try { value = String(await locator.innerText({ timeout: 1000 })); } catch {}
        if (value.includes(expected)) {
          return {
            kind: 'wait',
            action: step.action,
            selector,
            matched: true,
            characters: value.length,
            url: String(page.url?.() || ''),
          };
        }
        if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(120);
        else await new Promise(resolve => setTimeout(resolve, 120));
      }
      throw companionError('BROWSER_TEXT_NOT_FOUND', 408);
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

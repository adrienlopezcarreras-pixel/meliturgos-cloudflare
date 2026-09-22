import { launch } from '@cloudflare/playwright';
import {
  allowedDomainsFromOrigins,
  companionError,
  errorEnvelope,
  executeBrowserStep,
  normalizeCompanionPayload,
  successEnvelope,
} from './browser-core.js';

const KEEP_ALIVE_MS = 60000;

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function policyFingerprint(origins) {
  return JSON.stringify([...origins].sort());
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: Boolean(env.BROWSER && env.BROWSER_SESSIONS),
        schema: 'mel.devices.browser-companion.health.v1',
        browser_binding: Boolean(env.BROWSER),
        durable_object_binding: Boolean(env.BROWSER_SESSIONS),
      }, env.BROWSER && env.BROWSER_SESSIONS ? 200 : 503);
    }

    if (request.method !== 'POST'
        || !['/v1/browser/perform', '/v1/browser/close'].includes(url.pathname)) {
      return json({ ok: false, code: 'NOT_FOUND' }, 404);
    }

    const payload = await request.json().catch(() => null);
    const sessionId = typeof payload?.session_id === 'string' ? payload.session_id.trim().slice(0, 200) : '';
    if (!sessionId) return json({ ok: false, code: 'SESSION_AND_DEVICE_REQUIRED' }, 400);

    const id = env.BROWSER_SESSIONS.idFromName(sessionId);
    const stub = env.BROWSER_SESSIONS.get(id);
    return stub.fetch(new Request(`https://browser-session.internal${url.pathname}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }));
  },
};

export class BrowserSession {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.policy = '';
    this.tail = Promise.resolve();
  }

  fetch(request) {
    const next = this.tail.then(() => this.handle(request), () => this.handle(request));
    this.tail = next.catch(() => {});
    return next;
  }

  async handle(request) {
    const url = new URL(request.url);
    if (request.method !== 'POST') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);

    if (url.pathname === '/v1/browser/close') {
      await this.closeSession();
      return json({ ok: true, schema: 'mel.devices.browser-companion.close.v1' });
    }

    try {
      const payload = normalizeCompanionPayload(await request.json());
      const fingerprint = policyFingerprint(payload.sandbox.allowed_origins);
      const storedPolicy = await this.state.storage.get('policy_fingerprint');

      if (storedPolicy && storedPolicy !== fingerprint) {
        throw companionError('BROWSER_SESSION_POLICY_MISMATCH', 409);
      }

      if (!storedPolicy) {
        await this.state.storage.put('policy_fingerprint', fingerprint);
      }
      this.policy = fingerprint;

      await this.ensurePage(payload.sandbox.allowed_origins);
      const result = await executeBrowserStep(this.page, payload.step, payload.sandbox.allowed_origins);
      return json(successEnvelope(payload.step, result));
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 502;
      return json(errorEnvelope(error), status);
    }
  }

  async ensurePage(allowedOrigins) {
    if (this.browser && this.browser.isConnected?.() && this.page && !this.page.isClosed?.()) return;

    const domains = allowedDomainsFromOrigins(allowedOrigins);
    this.browser = await launch(this.env.BROWSER, {
      keep_alive: KEEP_ALIVE_MS,
      guardrails: {
        allowedDomains: domains,
      },
    });
    this.context = this.browser.contexts?.()[0] || await this.browser.newContext();
    this.page = this.context.pages?.()[0] || await this.context.newPage();
  }

  async closeSession() {
    try {
      if (this.browser) await this.browser.close();
    } catch {
      // Closing is best-effort and must never create a retryable browser side effect.
    }
    this.browser = null;
    this.context = null;
    this.page = null;
    this.policy = '';
    await this.state.storage.delete('policy_fingerprint');
  }
}

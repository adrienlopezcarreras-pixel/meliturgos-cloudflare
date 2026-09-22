import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedDomainsFromOrigins,
  executeBrowserStep,
  normalizeCompanionPayload,
} from '../browser-companion/runtime/browser-core.js';
import { BROWSER_CAPABILITY_SCHEMA } from '../src/devices/browser-capability.js';

function payload(step = {}) {
  return {
    schema: BROWSER_CAPABILITY_SCHEMA,
    session_id: 'session-live',
    device_id: 'browser-live',
    sandbox: { allowed_origins: ['https://example.com'] },
    step: {
      id: 'step-1',
      action: 'browser.navigate',
      url: 'https://example.com/',
      ...step,
    },
  };
}

test('companion normalizes exact HTTPS origins and guardrail hostnames', () => {
  const normalized = normalizeCompanionPayload(payload());
  assert.deepEqual(normalized.sandbox.allowed_origins, ['https://example.com']);
  assert.deepEqual(allowedDomainsFromOrigins(normalized.sandbox.allowed_origins), ['example.com']);
});

test('companion rejects non-HTTPS and out-of-sandbox navigation', () => {
  assert.throws(() => normalizeCompanionPayload(payload({ url: 'http://example.com/' })), {
    code: 'HTTPS_URL_REQUIRED',
  });
  assert.throws(() => normalizeCompanionPayload(payload({ url: 'https://outside.example/' })), {
    code: 'ORIGIN_OUTSIDE_SANDBOX',
  });
});

test('page executor performs navigation and bounded text read without leaking typed text', async () => {
  const calls = [];
  const page = {
    _url: 'about:blank',
    async goto(url) {
      this._url = url;
      calls.push(['goto', url]);
      return { status: () => 200 };
    },
    url() { return this._url; },
    async title() { return 'Example Domain'; },
    locator(selector) {
      return {
        async innerText() { calls.push(['innerText', selector]); return 'Example Domain body'; },
        async click() { calls.push(['click', selector]); },
        async fill(text) { calls.push(['fill', selector, text.length]); },
        async evaluate() { calls.push(['submit', selector]); },
      };
    },
    mouse: { async wheel(x, y) { calls.push(['wheel', x, y]); } },
    async screenshot() { return Buffer.from('jpeg'); },
    async waitForLoadState() {},
    async waitForEvent() {
      return {
        suggestedFilename: () => 'report.pdf',
        url: () => 'https://example.com/report.pdf',
        failure: async () => null,
      };
    },
  };

  const nav = await executeBrowserStep(page, payload().step, ['https://example.com']);
  assert.equal(nav.kind, 'navigation');
  assert.equal(nav.status, 200);

  const read = await executeBrowserStep(page, {
    id: 'read',
    action: 'browser.read-text',
    selector: 'body',
  }, ['https://example.com']);
  assert.equal(read.text, 'Example Domain body');

  const typed = await executeBrowserStep(page, {
    id: 'type',
    action: 'browser.type',
    selector: '#secret',
    text: 'private-value',
  }, ['https://example.com']);
  assert.equal(typed.characters, 13);
  assert.equal(JSON.stringify(typed).includes('private-value'), false);
});

test('page executor rejects missing selectors for interactive actions', async () => {
  const page = { url: () => 'https://example.com/' };
  await assert.rejects(() => executeBrowserStep(page, {
    id: 'click',
    action: 'browser.click',
  }, ['https://example.com']), {
    code: 'BROWSER_SELECTOR_REQUIRED',
  });
});

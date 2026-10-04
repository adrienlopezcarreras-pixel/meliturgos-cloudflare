import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_TIMEOUT_MS,
  WAIT_TEXT_TIMEOUT_MS,
  MAX_WAIT_TEXT_TIMEOUT_MS,
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

test('wait-text has a longer bounded budget than ordinary browser actions', () => {
  assert.equal(ACTION_TIMEOUT_MS,7000);
  assert.equal(WAIT_TEXT_TIMEOUT_MS,20000);
  assert.equal(MAX_WAIT_TEXT_TIMEOUT_MS,60000);
  assert.ok(WAIT_TEXT_TIMEOUT_MS>ACTION_TIMEOUT_MS);
});

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
        async setInputFiles(file) { calls.push(['upload', selector, file.name, file.mimeType, file.buffer.byteLength]); },
      };
    },
    mouse: { async wheel(x, y) { calls.push(['wheel', x, y]); } },
    async screenshot() { return Buffer.from('jpeg'); },
    async setExtraHTTPHeaders(headers) { calls.push(['headers',Object.keys(headers).sort()]); },
    async waitForTimeout(ms) { calls.push(['wait',ms]); },
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

test('page executor uploads bounded inline file content without echoing file bytes', async () => {
  const calls=[];
  const page={
    url:()=> 'https://example.com/',
    locator(selector){
      return {
        async setInputFiles(file){calls.push({selector,file});},
      };
    },
  };
  const result=await executeBrowserStep(page,{
    id:'upload',
    action:'browser.upload-file',
    selector:'#file',
    file_name:'proof.txt',
    mime_type:'text/plain',
    file_text:'private-proof-content',
  },['https://example.com']);
  assert.equal(result.kind,'upload');
  assert.equal(result.file_name,'proof.txt');
  assert.equal(result.mime_type,'text/plain');
  assert.equal(result.bytes,21);
  assert.equal(calls.length,1);
  assert.equal(calls[0].selector,'#file');
  assert.equal(calls[0].file.name,'proof.txt');
  assert.equal(calls[0].file.mimeType,'text/plain');
  assert.equal(calls[0].file.buffer.toString('utf8'),'private-proof-content');
  assert.equal(JSON.stringify(result).includes('private-proof-content'),false);
});

test('wait-text accepts a bounded per-step timeout without changing the default', async () => {
  const waits=[];
  let reads=0;
  const page={
    url(){return 'https://example.com/'},
    locator(){return {async innerText(){reads+=1;return reads>1?'READY':''}}},
    async waitForTimeout(ms){waits.push(ms)},
  };
  const result=await executeBrowserStep(page,{
    id:'wait-bounded',action:'browser.wait-text',selector:'#state',text:'READY',timeout_ms:45000,
  },['https://example.com']);
  assert.equal(result.matched,true);
  assert.ok(waits.length>=1);
});

test('page executor applies only normalized request headers and waits for expected text', async () => {
  const calls=[];
  let reads=0;
  const page={
    url:()=> 'https://example.com/',
    async setExtraHTTPHeaders(headers){calls.push(['headers',headers]);},
    async waitForTimeout(ms){calls.push(['wait',ms]);},
    locator(selector){
      return {
        async innerText(){
          reads+=1;
          calls.push(['read',selector,reads]);
          return reads<2?'uploading':'proof.txt ready';
        },
      };
    },
  };

  const headerResult=await executeBrowserStep(page,{
    id:'headers',
    action:'browser.set-headers',
    headers:{
      'x-mel-release-smoke':'1',
      'x-mel-launch-bootstrap':'secret-token',
      'x-mel-parallel-proof':'parallel-proof-token',
      'x-unsafe':'drop-me',
    },
  },['https://example.com']);
  assert.deepEqual(headerResult.header_names,['x-mel-release-smoke','x-mel-launch-bootstrap','x-mel-parallel-proof']);
  assert.equal(JSON.stringify(headerResult).includes('secret-token'),false);
  assert.deepEqual(calls[0][1],{
    'x-mel-release-smoke':'1',
    'x-mel-launch-bootstrap':'secret-token',
    'x-mel-parallel-proof':'parallel-proof-token',
  });

  const waitResult=await executeBrowserStep(page,{
    id:'wait',
    action:'browser.wait-text',
    selector:'#attachments',
    text:'proof.txt',
  },['https://example.com']);
  assert.equal(waitResult.kind,'wait');
  assert.equal(waitResult.matched,true);
  assert.ok(reads>=2);
  assert.equal(JSON.stringify(waitResult).includes('proof.txt'),false);
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../src/pages/mvp-interface.js';
import { maybeHandleLongChat, LEGACY_CHAT_INPUT_CHARS, MAX_CHAT_INPUT_CHARS } from '../src/api/long-chat.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const auth = 'Basic ' + Buffer.from('test:test-only').toString('base64');

function request(text) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify({ text, conversation_id: 'long-test', device_id: 'ubuntu' }),
  });
}

test('MEL main interface exposes 100k composer and extensible theme switcher', async () => {
  const html = await (await onRequestGet({})).text();
  assert.match(html, /id="themeButton"/);
  assert.match(html, /data-theme-choice="classic"/);
  assert.match(html, /data-theme-choice="crusade"/);
  assert.match(html, /data-theme-choice="religious"/);
  assert.match(html, /localStorage\.setItem\('mel\.theme'/);
  assert.match(html, /maxlength="100000"/);
  assert.match(html, /const MAX_INPUT=100000,LEGACY_INPUT=12000/);
  assert.match(html, /Prompts longs Gen2 activés/);
  assert.match(html, /e\.key==='Enter'&&!e\.shiftKey/);
});

test('long-chat leaves legacy-sized messages on the proven legacy route', async () => {
  const result = await maybeHandleLongChat(request('x'.repeat(LEGACY_CHAT_INPUT_CHARS)), {
    MELITURGOS_USER: 'test', MELITURGOS_PASSWORD: 'test-only'
  });
  assert.equal(result, null);
});

test('long-chat accepts more than 12k chars, calls Workers AI and archives both messages', async () => {
  const DB = sqliteD1();
  const calls = [];
  const env = {
    DB,
    MELITURGOS_USER: 'test',
    MELITURGOS_PASSWORD: 'test-only',
    AI: { async run(model, input) { calls.push({ model, input }); return { response: 'Prompt long reçu et compris.' }; } },
  };
  try {
    const text = 'instruction longue '.repeat(900);
    assert.ok(text.length > LEGACY_CHAT_INPUT_CHARS);
    assert.ok(text.length < MAX_CHAT_INPUT_CHARS);
    const response = await maybeHandleLongChat(request(text), env);
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.equal(data.long_input, true);
    assert.equal(data.input_chars, text.trim().length);
    assert.equal(data.max_input_chars, MAX_CHAT_INPUT_CHARS);
    assert.equal(data.archive_saved, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].input.messages.at(-1).content, text.trim());
    const rows = (await DB.prepare('SELECT role,content FROM archive_messages ORDER BY timestamp,id').all()).results;
    assert.equal(rows.length, 2);
    assert.equal(rows[0].role, 'user');
    assert.equal(rows[0].content, text.trim());
    assert.equal(rows[1].role, 'assistant');
  } finally { DB.close(); }
});

test('long-chat rejects input above 100k before model invocation', async () => {
  let calls = 0;
  const env = {
    MELITURGOS_USER: 'test',
    MELITURGOS_PASSWORD: 'test-only',
    AI: { async run() { calls++; return { response: 'should not run' }; } },
  };
  const response = await maybeHandleLongChat(request('x'.repeat(MAX_CHAT_INPUT_CHARS + 1)), env);
  const data = await response.json();
  assert.equal(response.status, 413);
  assert.equal(data.code, 'MESSAGE_TOO_LONG');
  assert.equal(calls, 0);
});

test('long-chat requires MEL authentication before using AI', async () => {
  let calls = 0;
  const response = await maybeHandleLongChat(new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'x'.repeat(LEGACY_CHAT_INPUT_CHARS + 1) }),
  }), {
    MELITURGOS_USER: 'test',
    MELITURGOS_PASSWORD: 'test-only',
    AI: { async run() { calls++; return { response: 'no' }; } },
  });
  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});

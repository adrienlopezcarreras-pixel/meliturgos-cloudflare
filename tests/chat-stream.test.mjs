import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { handleNativeChat } from '../src/api/native-chat.js';
import { selectStreamModel, readWorkersAiSse, sseEventText } from '../src/api/chat-stream.js';
import { melParseNdjsonLines } from '../src/pages/mel-chat-stream.js';
import { onRequestGet as fullMode } from '../src/pages/full-interface-v2.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

function sse(chunks, { finish = 'stop', style = 'response' } = {}) {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        const payload = style === 'openai' ? { choices: [{ delta: { content: chunk } }] } : { response: chunk };
        controller.enqueue(enc.encode('data: ' + JSON.stringify(payload) + '\n\n'));
      }
      controller.enqueue(enc.encode('data: ' + JSON.stringify(style === 'openai' ? { choices: [{ delta: {}, finish_reason: finish }] } : { response: '', finish_reason: finish }) + '\n\n'));
      controller.enqueue(enc.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

async function readNdjson(response) {
  const raw = await response.text();
  return raw.trim().split('\n').map(line => JSON.parse(line));
}

test('SSE parser handles Workers AI and OpenAI-style chunks', async () => {
  for (const style of ['response', 'openai']) {
    let text = ''; let finish = null;
    await readWorkersAiSse(sse(['Bon', 'jour'], { style, finish: 'length' }), { onText: t => { text += t; }, onFinish: r => { finish = r; } });
    assert.equal(text, 'Bonjour');
    assert.equal(finish, 'length');
  }
  assert.equal(sseEventText({ response: 'a' }), 'a');
  assert.equal(sseEventText(null), '');
});

test('model selection keeps long prompts on a model whose context fits', () => {
  assert.equal(selectStreamModel([{ content: 'x'.repeat(10_000) }]), '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  assert.equal(selectStreamModel([{ content: 'x'.repeat(120_000) }]), '@cf/google/gemma-4-26b-a4b-it');
  assert.equal(selectStreamModel([{ content: 'x' }], { MEL_STREAM_MODEL: '@cf/test/forced' }), '@cf/test/forced');
});

test('a long answer streams to the browser and the exchange is archived', async () => {
  const DB = sqliteD1();
  const calls = [];
  try {
    const long = Array.from({ length: 400 }, (_, i) => `Paragraphe ${i}. `);
    const env = { DB, AI: { async run(model, input) { calls.push({ model, stream: input.stream, max_tokens: input.max_tokens }); return sse(long); } } };
    const prompt = 'Explique en détail, section par section : ' + 'contexte détaillé. '.repeat(1500);
    const response = await handleNativeChat(new Request('https://mel.example/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: prompt, conversation_id: 'stream-1', stream: true, use_companion_compute: false }),
    }), env, { authorized: true });
    assert.match(response.headers.get('content-type'), /application\/x-ndjson/);
    const events = await readNdjson(response);
    assert.equal(events[0].type, 'start');
    const text = events.filter(e => e.type === 'delta').map(e => e.text).join('');
    assert.equal(text, long.join(''));
    const done = events.at(-1);
    assert.equal(done.type, 'done');
    assert.equal(done.archived, true);
    const streamCall = calls.find(c => c.stream === true);
    assert.ok(streamCall, 'model is called in stream mode');
    assert.ok(streamCall.max_tokens >= 8192, 'long answers get a large output budget');
    const rows = DB.prepare ? await DB.prepare("SELECT role, content, provenance FROM archive_messages WHERE conversation_id='stream-1' ORDER BY timestamp").all() : null;
    assert.deepEqual(rows.results.map(r => r.role), ['user', 'assistant']);
    assert.equal(rows.results[1].content, long.join(''));
    assert.equal(rows.results[1].provenance, 'native-chat:stream');
  } finally {
    DB.close();
  }
});

test('stream failure before any text is reported, partial text is kept', async () => {
  const DB = sqliteD1();
  try {
    const failing = { async run() { throw Object.assign(new Error('boom'), { code: 'AI_DOWN' }); } };
    const response = await handleNativeChat(new Request('https://mel.example/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'explique les abeilles', conversation_id: 'stream-2', stream: true, use_companion_compute: false }),
    }), { DB, AI: failing }, { authorized: true });
    const events = await readNdjson(response);
    assert.deepEqual(events.at(-1), { type: 'error', code: 'AI_DOWN', partial_chars: 0 });
  } finally {
    DB.close();
  }
});

test('without stream:true the JSON contract is unchanged', async () => {
  const DB = sqliteD1();
  try {
    const response = await handleNativeChat(new Request('https://mel.example/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'explique les abeilles', conversation_id: 'stream-3', use_companion_compute: false }),
    }), { DB, AI: { async run() { return { response: 'Les abeilles butinent.' }; } } }, { authorized: true });
    assert.match(response.headers.get('content-type'), /application\/json/);
    const payload = await response.json();
    assert.equal(payload.ok, true);
  } finally {
    DB.close();
  }
});

test('NDJSON client parser keeps incomplete trailing lines for the next chunk', () => {
  const first = melParseNdjsonLines('{"type":"start"}\n{"type":"delta","text":"Bon');
  assert.deepEqual(first.events, [{ type: 'start' }]);
  const second = melParseNdjsonLines(first.rest + 'jour"}\n');
  assert.deepEqual(second.events, [{ type: 'delta', text: 'Bonjour' }]);
});

test('full mode page ships the streaming client and still parses', async () => {
  const html = await (await fullMode({ request: new Request('https://mel.example/full'), env: {} })).text();
  assert.match(html, /async function melChatFetch\(/);
  assert.match(html, /await melChatFetch\(\{text,/);
  const main = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(src => src.includes('melChatFetch'));
  assert.doesNotThrow(() => new vm.Script(main));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { handleNativeChat } from '../src/api/native-chat.js';
import { selectStreamModel, streamModelCandidates, streamChatResponse, readWorkersAiSse, sseEventText } from '../src/api/chat-stream.js';
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
  assert.equal(sseEventText({ response: '', choices: [{ delta: { content: 'stream fragment' } }] }), 'stream fragment');
  assert.equal(sseEventText({ response: '', text: 'valid alternate' }), 'valid alternate');
  assert.equal(sseEventText({ response: '  ', choices: [{ text: 'choice fallback' }] }), 'choice fallback');
  assert.equal(sseEventText(null), '');
});

test('model selection keeps long prompts on a model whose context fits', () => {
  // gpt-oss-120b (128k context) leads; llama only fits short prompts; gemma is the last resort.
  assert.equal(selectStreamModel([{ content: 'x'.repeat(10_000) }]), '@cf/openai/gpt-oss-120b');
  assert.deepEqual(streamModelCandidates([{ content: 'x'.repeat(10_000) }]), ['@cf/openai/gpt-oss-120b', '@cf/nvidia/nemotron-3-120b-a12b', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/google/gemma-4-26b-a4b-it']);
  assert.deepEqual(streamModelCandidates([{ content: 'x'.repeat(120_000) }]), ['@cf/openai/gpt-oss-120b', '@cf/nvidia/nemotron-3-120b-a12b', '@cf/google/gemma-4-26b-a4b-it']);
  assert.deepEqual(streamModelCandidates([{ content: 'x'.repeat(500_000) }]), ['@cf/google/gemma-4-26b-a4b-it']);
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
  assert.match(html, /idleMs = 105000/);
  assert.doesNotMatch(html, /aucun texte reçu depuis 45/);
  assert.match(html, /await melChatFetch\(\{text,/);
  assert.match(html, /function melRenderTrace\(/);
  const main = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(src => src.includes('melChatFetch'));
  assert.doesNotThrow(() => new vm.Script(main));
});

test('« Ce que j’ai fait » only reports what the server returned', async () => {
  const { melTraceModel } = await import('../src/pages/mel-chat-trace.js');
  const trace = melTraceModel({
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', elapsed_ms: 3400, archive_saved: true,
    tool_results: [{ capability: 'code.read', status: 'SUCCEEDED' }, { capability: 'web.research', status: 'FAILED', error: 'WEB_TIMEOUT' }],
    computer_command: { command_id: 'cmd-1' },
  });
  assert.equal(trace.summary, '1 action réussie, 1 en échec · llama-3.3-70b-instruct-fp8-fast · 3,4 s');
  assert.deepEqual(trace.steps.map(s => s.icon + s.label + s.detail), ['✓code.read', '✗web.researchWEB_TIMEOUT']);
  assert.deepEqual(trace.outputs, ['Commande PC cmd-1']);
  assert.ok(trace.notes.includes('enregistrée dans la conversation'));
  const direct = melTraceModel({ model: '@cf/google/gemma-4-26b-a4b-it', streamed: true, response_truncated: true });
  assert.equal(direct.summary, 'réponse directe · gemma-4-26b-a4b-it');
  assert.ok(direct.notes.includes('réponse tronquée'));
  assert.ok(!direct.notes.includes('enregistrée dans la conversation'), 'no claim without archive proof');
});

test('chat JSON no longer ships the full capability manifest to the browser', async () => {
  const DB = sqliteD1();
  try {
    const response = await handleNativeChat(new Request('https://mel.example/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'explique les abeilles', conversation_id: 'trace-1', use_companion_compute: false }),
    }), { DB, AI: { async run() { return { response: 'Les abeilles butinent.' }; } } }, { authorized: true });
    const payload = await response.json();
    assert.equal('capability_manifest' in payload, false);
  } finally {
    DB.close();
  }
});

test('page modules survive Wrangler keepNames bundling (__name helper defined in the page)', async () => {
  const { MEL_PAGE_NAME_SHIM } = await import('../src/pages/page-name-shim.js');
  // esbuild keepNames rewrites `const bump = () => …` into `const bump = __name(() => …, "bump")`
  // inside function bodies serialised with toString(); __name only exists in the Worker bundle.
  const bundledLike = 'function melChatFetchLike(){ const bump = __name(() => 42, "bump"); return bump(); } globalThis.out = melChatFetchLike();';
  assert.throws(() => vm.runInNewContext(bundledLike, {}), /__name is not defined/);
  const ctx = {};
  vm.runInNewContext(MEL_PAGE_NAME_SHIM + '\n' + bundledLike, ctx);
  assert.equal(ctx.out, 42);
  const html = await (await fullMode({ request: new Request('https://mel.example/full'), env: {} })).text();
  const shimAt = html.indexOf('var __name = typeof __name');
  assert.ok(shimAt > 0, 'shim injected');
  for (const marker of ['function melChatFetch(', 'function melRenderTrace(', 'function melInstallAutoRelaunch(']) {
    assert.ok(html.indexOf(marker) > shimAt, marker + ' must come after the __name shim');
  }
});

test('a model failing before writing anything is replaced silently by the next one', async () => {
  const tried = [];
  const env = { AI: { async run(model) {
    tried.push(model);
    if (model === '@cf/openai/gpt-oss-120b') throw Object.assign(new Error('5007'), { code: 'MODEL_UNAVAILABLE' });
    const enc = new TextEncoder();
    return new ReadableStream({ start(c) { c.enqueue(enc.encode('data: {"response":"Bonjour"}\n\ndata: [DONE]\n\n')); c.close(); } });
  } } };
  const text = await streamChatResponse({ env, messages: [{ role: 'user', content: 'salut' }] }).text();
  const events = text.trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(tried, ['@cf/openai/gpt-oss-120b', '@cf/nvidia/nemotron-3-120b-a12b']);
  assert.equal(events.find(e => e.type === 'model').fallback_from, '@cf/openai/gpt-oss-120b');
  assert.equal(events.find(e => e.type === 'done').model, '@cf/nvidia/nemotron-3-120b-a12b');
  assert.equal(events.some(e => e.type === 'error'), false);
});

test('gpt-oss reasoning deltas never leak into the answer', () => {
  assert.equal(sseEventText({ choices: [{ delta: { reasoning_content: 'je réfléchis…' } }] }), '');
  assert.equal(sseEventText({ choices: [{ delta: { content: 'Réponse' } }] }), 'Réponse');
});

test('when no cloud model can answer, the local PC model takes over; never otherwise', async () => {
  const down = { AI: { async run() { throw Object.assign(new Error('quota'), { code: 'QUOTA_EXCEEDED' }); } } };
  let localCalls = 0;
  const localFallback = async () => { localCalls += 1; return { ok: true, text: 'Réponse locale', model: 'pc:qwen3:8b' }; };
  const events = (await streamChatResponse({ env: down, messages: [{ role: 'user', content: 'salut' }], localFallback }).text()).trim().split('\n').map(l => JSON.parse(l));
  assert.equal(localCalls, 1);
  assert.equal(events.find(e => e.type === 'done').model, 'pc:qwen3:8b');
  assert.equal(events.filter(e => e.type === 'delta').map(e => e.text).join(''), 'Réponse locale');
  const up = { AI: { async run() { return { response: 'Réponse cloud' }; } } };
  await streamChatResponse({ env: up, messages: [{ role: 'user', content: 'salut' }], localFallback }).text();
  assert.equal(localCalls, 1, 'local model untouched while the cloud answers');
});

test('stream drops fake tool calls and English agent narration, keeps the French answer', async () => {
  const { createToolLeakFilter, withNoToolsNote, STREAM_NO_TOOLS_NOTE, plainChatMayStream } = await import('../src/api/chat-stream.js');
  const leaked = 'Search code for "refactor".{\n  "tool": "code.search",\n  "parameters": {"query": "refactor"}\n}We need to see TOOL_RESULT.{"tool":"code.read","parameters":{"path":"x"}}Given constraints, respond that actions are being executed.J’ai regardé : voici ma proposition. Le JSON {"a":1} reste.';
  for (const size of [1, 4, 33, 10_000]) {
    const filter = createToolLeakFilter();
    let out = '';
    for (let i = 0; i < leaked.length; i += size) out += filter.push(leaked.slice(i, i + size));
    out += filter.flush();
    assert.equal(out, 'J’ai regardé : voici ma proposition. Le JSON {"a":1} reste.', 'chunk ' + size);
  }
  for (const text of ['Oui.', 'Bonjour Adrien ! Voici la réponse.', '## Titre\n\n| a | b |\nTexte']) {
    const filter = createToolLeakFilter();
    assert.equal(filter.push(text) + filter.flush(), text);
  }
  const messages = withNoToolsNote([{ role: 'system', content: 'S' }, { role: 'user', content: 'go' }]);
  assert.equal(messages.length, 2);
  assert.ok(messages[0].content.endsWith(STREAM_NO_TOOLS_NOTE));
  const plain = { stream: true, toolCount: 0, ai: true };
  assert.equal(plainChatMayStream(plain), true);
  assert.equal(plainChatMayStream({ ...plain, actionRequest: true }), false);
  assert.equal(plainChatMayStream({ ...plain, toolCount: 1 }), false);
});

// GPT6 regression: model-produced name/arguments JSON is not a genuine tool result.
test('stream suppresses fake name/arguments tool calls across chunk boundaries', async () => {
  const { createToolLeakFilter } = await import('../src/api/chat-stream.js');
  for (const fake of [
    '{"name":"code.search","arguments":{"path":".","query":"applied"}}',
    '{"name":"autonomy.status","arguments":{}}',
    '{"tool":"code.read","parameters":{"path":"src/index.js"}}',
  ]) {
    for (const size of [1, 7, 999]) {
      const filter = createToolLeakFilter();
      const input = fake + 'Je ne peux pas confirmer une exécution.';
      let actual = '';
      for (let i = 0; i < input.length; i += size) actual += filter.push(input.slice(i, i + size));
      actual += filter.flush();
      assert.equal(actual, 'Je ne peux pas confirmer une exécution.');
      assert.equal(filter.dropped, 1);
    }
  }
  const filter = createToolLeakFilter();
  assert.equal(filter.push('Voici des données : {"name":"Alice","age":4}') + filter.flush(), 'Voici des données : {"name":"Alice","age":4}');
});

test('Professor streaming keeps Code and Conversation on distinct primaries without changing Normal', async () => {
  const normalModel = '@cf/test/normal-configured';
  const codeModel = '@cf/nvidia/nemotron-3-120b-a12b';
  const chatModel = '@cf/openai/gpt-oss-120b';
  const codeBackup = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  const calls = [];
  const env = { MEL_STREAM_MODEL: normalModel, AI: {
    async run(model) { calls.push(model); return sse(['Bonjour']); },
  } };
  const messages = [{ role: 'user', content: 'bonjour' }];
  const normal = await readNdjson(streamChatResponse({ env, messages }));
  assert.equal(normal[0].model, normalModel, 'Normal retains its exact existing stream choice');
  const conversation = await readNdjson(streamChatResponse({
    env, messages, preferredModel: chatModel, modelOrder: [chatModel, codeBackup],
  }));
  const code = await readNdjson(streamChatResponse({
    env, messages, preferredModel: codeModel, modelOrder: [codeModel, codeBackup],
  }));
  assert.equal(conversation[0].model, chatModel);
  assert.equal(code[0].model, codeModel);
  assert.deepEqual(calls, [normalModel, chatModel, codeModel]);

  const fallbacks = [];
  const codeEnv = { AI: { async run(model) {
    fallbacks.push(model);
    if (model === codeModel) throw Error('MODEL_UNAVAILABLE');
    return sse(['Repli Code']);
  } } };
  const fallback = await readNdjson(streamChatResponse({
    env: codeEnv, messages, preferredModel: codeModel, modelOrder: [codeModel, codeBackup],
  }));
  assert.equal(fallback.at(-1).model, codeBackup);
  assert.deepEqual(fallbacks, [codeModel, codeBackup]);
});

test('native Professor streams Conversation and returns verified Code NDJSON without changing Normal', async () => {
  const DB = sqliteD1();
  const normalModel = '@cf/test/normal-configured';
  const codeModel = '@cf/nvidia/nemotron-3-120b-a12b';
  const chatModel = '@cf/openai/gpt-oss-120b';
  const called = [];
  const env = { DB, MEL_STREAM_MODEL: normalModel, AI: {
    async run(model, input) {
      called.push({ model, streaming: input?.stream === true });
      return input?.stream === true ? sse(['Réponse vérifiée.']) : { response:'Réponse vérifiée.' };
    },
  } };
  const send = async (suffix, intent_context = undefined) => {
    const response = await handleNativeChat(new Request('https://mel.example/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'Raconte un souvenir fictif en une phrase.',
        conversation_id: 'role-stream-' + suffix,
        stream: true, use_companion_compute: false,
        ...(intent_context ? { intent_context } : {}),
      }),
    }), env, { authorized: true });
    if (suffix === 'code') {
      // Code may use the same NDJSON transport, but it must publish only
      // a completed, evidence-checked answer rather than raw model tokens.
      assert.match(response.headers.get('content-type') || '', /application\/x-ndjson/);
      const events = await readNdjson(response);
      assert.equal(events[0].type, 'start');
      assert.equal(events.at(-1).type, 'done');
      const emittedText = events.filter(e => e.type === 'delta').map(e => String(e.text || '')).join('');
      assert.ok(emittedText.includes('Réponse vérifiée.'));
      assert.equal(events.at(-1).chars, emittedText.length);
      return events.at(-1).model;
    }
    assert.match(response.headers.get('content-type') || '', /application\/x-ndjson/);
    const events = await readNdjson(response);
    assert.equal(events.at(-1).type, 'done');
    return events[0].model;
  };
  try {
    assert.equal(await send('normal'), normalModel);
    assert.equal(await send('assistant', { surface: 'mel-full', role: 'assistant', requested_mode: 'conversation' }), chatModel);
    assert.equal(await send('code', { surface: 'mel-full', role: 'developer', requested_mode: 'code' }), codeModel);
    assert.deepEqual(called, [
      { model:normalModel, streaming:true },
      { model:chatModel, streaming:true },
      { model:codeModel, streaming:true },
    ]);
  } finally {
    DB.close?.();
  }
});

test('Professor Code NDJSON buffers model claims until authenticated final verification', async () => {
  const raw='J’ai exécuté d1.write : {"success": true}.';
  let archived='';
  const response=streamChatResponse({
    env:{AI:{async run(){return sse([raw.slice(0,19),raw.slice(19)])}}},
    messages:[{role:'user',content:'continue'}],
    model:'@cf/test/code',
    verifyCompletedText:(text) => {
      assert.equal(text,raw);
      return 'Aucune écriture D1 authentifiée n’a été exécutée dans cet échange.';
    },
    archive:async(text)=>{archived=text;return true;},
  });
  assert.match(response.headers.get('content-type'),/application\/x-ndjson/);
  const events=await readNdjson(response);
  const deltas=events.filter(e=>e.type==='delta').map(e=>e.text);
  assert.deepEqual(deltas,['Aucune écriture D1 authentifiée n’a été exécutée dans cet échange.']);
  assert.doesNotMatch(JSON.stringify(events),/J’ai exécuté d1\.write/);
  assert.equal(archived,deltas.join(''));
  assert.equal(events.at(-1).type,'done');
});

test('Professor Code verification failure does not emit or archive unverified content', async()=>{
  let archived=false;
  const response=streamChatResponse({
    env:{AI:{async run(){return sse(['J’ai exécuté d1.write : succès.'])}}},
    messages:[{role:'user',content:'go'}],
    model:'@cf/test/code',
    verifyCompletedText:()=>{throw Object.assign(new Error('PROOF_UNAVAILABLE'),{code:'PROOF_UNAVAILABLE'});},
    archive:async()=>{archived=true;return true;},
  });
  const events=await readNdjson(response);
  assert.equal(events.some(e=>e.type==='delta'),false);
  assert.equal(archived,false);
  assert.equal(events.at(-1).type,'error');
  assert.equal(events.at(-1).code,'PROOF_UNAVAILABLE');
});

test('a model that never starts streaming is skipped after the start timeout', async () => {
  const { streamChatResponse } = await import('../src/api/chat-stream.js');
  const tried = [];
  const env = { MEL_STREAM_START_TIMEOUT_MS: '5000', AI: { run: async (model) => {
    tried.push(model);
    if (tried.length === 1) return new Promise(() => {});
    return { response: 'Bonjour Adrien' };
  } } };
  const started = Date.now();
  const response = streamChatResponse({ env, messages: [{ role: 'user', content: 'bonjour' }] });
  const text = await response.text();
  assert.ok(Date.now() - started < 9000);
  assert.equal(tried.length, 2);
  assert.match(text, /STREAM_START_TIMEOUT/);
  assert.match(text, /Bonjour Adrien/);
  assert.match(text, /"fallbacks":\[\{"model":"[^"]+","reason":"STREAM_START_TIMEOUT"\}\]/);
});

test('an advisory plan streams through the real chat with one inference and no action planner',async()=>{
 const calls=[];
 const response=await handleNativeChat(new Request('https://mel.example/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'Établis un plan d’action en 5 étapes pour lancer une activité de traduction en ligne',stream:true,use_companion_compute:false})}),{
  AI:{async run(model,input){calls.push({model,stream:input.stream});assert.equal(input.stream,true);return sse(['1. Définir l’offre.\n','2. Choisir une clientèle.\n','3. Préparer des exemples.\n','4. Présenter les services.\n','5. Mesurer les résultats.']);}}
 },{authorized:true});
 assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/ndjson/);
 const events=await readNdjson(response);
 assert.equal(calls.length,1);assert.equal(events.at(-1).type,'done');
 assert.match(events.filter(event=>event.type==='delta').map(event=>event.text).join(''),/5\. Mesurer/);
});

test('a question about seeing future development targets stays conversational in Code mode',async()=>{
 let calls=0;
 const response=await handleNativeChat(new Request('https://mel.example/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:"on doit commencer à développer la mini et l'apk pour pouvoir les utiliser, tu les vois ?",stream:true,use_companion_compute:false,intent_context:{surface:'mel-full',role:'developer',requested_mode:'code'}})}),{
  AI:{async run(_model,input){calls++;assert.equal(input.stream,true);return sse(['Parles-tu des fichiers du dépôt ou des appareils connectés ?']);}}
 },{authorized:true});
 assert.equal(response.status,200);const events=await readNdjson(response);
 assert.equal(calls,1,'no action planner or development preclassification');assert.equal(events.at(-1).type,'done');
 assert.match(events.filter(e=>e.type==='delta').map(e=>e.text).join(''),/fichiers du dépôt/);
});

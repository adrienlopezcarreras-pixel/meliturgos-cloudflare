import test from 'node:test';
import assert from 'node:assert/strict';
import { inferenceGenerationOptions, runNativeInference, loadCognitiveMemory, compactInferenceMessages, voiceGenerationTokenBudget, completeTruncatedNativeInference, runBoundedChatFallback } from '../src/api/native-chat.js';

test('promoted inference generation settings reach the direct AI payload', async () => {
  const calls = [];
  const env = { AI: { run: async (model, payload) => { calls.push({ model, payload }); return { response: 'ok' }; } } };
  const settings = { temperature: 0.22, top_p: 0.81, max_tokens: 3072, memory_results: 7, review_passes: 2, council_min_responses: 3 };
  const result = await runNativeInference({ env, messages: [{ role: 'user', content: 'hello' }], text: 'hello', inferenceSettings: settings });
  assert.equal(result.text, 'ok');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.temperature, 0.22);
  assert.equal(calls[0].payload.top_p, 0.81);
  assert.equal(calls[0].payload.max_tokens, 3072);
  assert.equal('review_passes' in calls[0].payload, false);
  assert.equal('memory_results' in calls[0].payload, false);
});

test('no promoted settings preserves provider defaults', async () => {
  const options = inferenceGenerationOptions(null);
  assert.deepEqual(options, {});
  const calls = [];
  const env = { AI: { run: async (_model, payload) => { calls.push(payload); return { response: 'ok' }; } } };
  await runNativeInference({ env, messages: [{ role: 'user', content: 'hello' }], text: 'hello' });
  assert.deepEqual(Object.keys(calls[0]).sort(), ['messages']);
});

test('memory_results bounds the cognitive-memory retrieval count', async () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ content: 'm' + i, importance: 20 - i, source: 'test', created_at: i }));
  const env = { DB: { prepare(sql) { return { bind() { return this; }, async run() { return { success: true }; }, async all() { return sql.includes('SELECT * FROM memories') ? { results: rows } : { results: [] }; } }; } } };
  const retrieved = await loadCognitiveMemory(env, 5);
  assert.equal(retrieved.count, 5);
});


test('compact inference fallback preserves current turn and bounds oversized context', () => {
  const messages = [
    { role: 'system', content: 'S'.repeat(60000) + 'SYSTEM_TAIL' },
    ...Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `history-${i}-` + 'H'.repeat(4000) })),
    { role: 'user', content: 'CURRENT_USER_MESSAGE' },
  ];
  const compact = compactInferenceMessages(messages, {
    systemChars: 12000,
    historyChars: 6000,
    maxHistoryMessages: 4,
  });
  assert.equal(compact[0].role, 'system');
  assert.ok(compact[0].content.length <= 12000);
  assert.match(compact[0].content, /SYSTEM_TAIL$/);
  assert.equal(compact.at(-1).role, 'user');
  assert.equal(compact.at(-1).content, 'CURRENT_USER_MESSAGE');
  assert.ok(compact.length <= 6);
  const historyChars = compact.slice(1, -1).reduce((sum, row) => sum + row.content.length, 0);
  assert.ok(historyChars <= 6000);
});


test('voice-style inference can force a single fast model with a short router timeout', async () => {
  const calls = [];
  const env = {
    AI: {
      run: async (model, payload) => {
        calls.push({ model, payload });
        return { response: 'réponse rapide' };
      },
    },
  };
  const result = await runNativeInference({
    env,
    messages: [{ role: 'user', content: 'bonjour' }],
    text: 'bonjour',
    taskOverride: 'FAST',
    preferredModel: '@cf/zai-org/glm-4.7-flash',
    timeoutMs: 6000,
    maxCalls: 1,
  });
  assert.equal(result.text, 'réponse rapide');
  assert.equal(result.task, 'FAST');
  assert.equal(result.model, '@cf/zai-org/glm-4.7-flash');
  assert.equal(calls.length, 1);
});


test('voice token budgets avoid 160-180-token incomplete responses while remaining bounded', () => {
  assert.equal(voiceGenerationTokenBudget(), 768);
  assert.equal(voiceGenerationTokenBudget(null, { fallback: true }), 512);
  assert.equal(voiceGenerationTokenBudget({ max_tokens: 180 }), 384);
  assert.equal(voiceGenerationTokenBudget({ max_tokens: 180 }, { fallback: true }), 384);
  assert.equal(voiceGenerationTokenBudget({ max_tokens: 3072 }), 1024);
  assert.equal(voiceGenerationTokenBudget({ max_tokens: 3072 }, { fallback: true }), 768);
  assert.equal(voiceGenerationTokenBudget({ max_tokens: -1 }), 768);
});


test('native chat continues only explicit token-limit truncations, once', async () => {
  let calls = 0;
  const messages = [{role:'system',content:'Sois exact'}, {role:'user',content:'Explique le protocole'}];
  const initial = {text:'Le protocole comprend trois étapes,',truncated:true,finish_reason:'length',model:'test'};
  const result = await completeTruncatedNativeInference(initial, messages, async nextMessages => {
    calls += 1;
    assert.equal(nextMessages.at(-2).role,'assistant');
    assert.equal(nextMessages.at(-2).content,initial.text);
    assert.match(nextMessages.at(-1).content,/Continue uniquement/);
    return {text:'puis il se termine.',truncated:false,finish_reason:'stop'};
  });
  assert.equal(calls,1);
  assert.equal(result.text,'Le protocole comprend trois étapes, puis il se termine.');
  assert.equal(result.truncated,false);
  assert.equal(result.continuation_succeeded,true);
  assert.equal(result.finish_reason,'stop');
  await completeTruncatedNativeInference({text:'Réponse complète.',truncated:false,finish_reason:'stop'}, messages,async () => {calls++;});
  assert.equal(calls,1);
});

test('native chat keeps truncation visible if continuation fails or truncates again',async()=>{
  const initial={text:'Explication commencée',truncated:true,finish_reason:'length'};
  const broken=await completeTruncatedNativeInference(initial,[],async()=>{throw Error('network');});
  assert.equal(broken.text,initial.text);
  assert.equal(broken.truncated,true);
  assert.equal(broken.continuation_attempted,true);
  const repeated=await completeTruncatedNativeInference(initial,[],async()=>({text:' mais pas finie',truncated:true,finish_reason:'length'}));
  assert.equal(repeated.truncated,true);
  assert.equal(repeated.text,'Explication commencée mais pas finie');
});

test('native chat removes direct overlapping continuation text',async()=>{
  const initial={text:'Un long morceau qui finit avec des mots répétés',truncated:true};
  const result=await completeTruncatedNativeInference(initial,[],async()=>({text:'avec des mots répétés et une vraie conclusion.',finish_reason:'stop'}));
  assert.equal(result.text,'Un long morceau qui finit avec des mots répétés et une vraie conclusion.');
});

test('bounded cloud fallback times out a hung provider and permits recovery', async () => {
  let attempted = 0;
  const hung = () => { attempted += 1; return new Promise(() => {}); };
  await assert.rejects(
    runBoundedChatFallback(hung, 'stalled', { messages: [] }, { timeoutMs: 12 }),
    { code: 'CHAT_FALLBACK_TIMEOUT' },
  );
  const result = await runBoundedChatFallback(async () => ({ response: 'modèle de secours OK' }), 'fast', { messages: [] }, { timeoutMs: 12 });
  assert.equal(result.response, 'modèle de secours OK');
  assert.equal(attempted, 1);
});

test('bounded cloud fallback propagates real provider failures without hiding them', async () => {
  await assert.rejects(
    runBoundedChatFallback(async () => { throw Object.assign(Error('rate limited'), { code: '429' }); }, 'x', {}, { timeoutMs: 100 }),
    { code: '429' },
  );
});

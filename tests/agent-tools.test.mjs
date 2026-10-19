import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgentToolLoop, parseAgentAction, responseIsBareToolCall, stripLeakedToolCalls, executeLeakedReads, AGENT_MAX_STEPS } from '../src/api/agent-tools.js';

const bus = (calls) => ({
  list: () => ['capability.audit', 'evolution.enqueue', 'autonomy.status'].map(id => ({ id, description: id, input_schema: { type: 'object' } })),
  async execute(id, input) { calls.push([id, input]); return { ok: true, id }; },
});
const ai = (replies) => ({ AI: { async run() { return { response: replies.shift() ?? '{"final":true}' }; } } });

test('the model calls its own tools and stops on final', async () => {
  const calls = [];
  const r = await runAgentToolLoop({ env: ai(['{"tool":"capability.audit","input":{"deep":true}}', '{"final":true}']), bus: bus(calls), text: 'lance l’audit' });
  assert.deepEqual(calls, [['capability.audit', { deep: true }]]);
  assert.equal(r[0].status, 'SUCCEEDED');
});

test('a development request is enqueued', async () => {
  const calls = [];
  await runAgentToolLoop({ env: ai(['{"tool":"evolution.enqueue","input":{"goal":"auto-test complet"}}']), bus: bus(calls), text: 'développe ton auto-test' });
  assert.equal(calls[0][0], 'evolution.enqueue');
});

test('tools outside the allowlist are refused and the loop is bounded', async () => {
  const calls = [];
  const replies = Array.from({ length: 20 }, (_, i) => i === 0 ? '{"tool":"payments.send","input":{}}' : '{"tool":"autonomy.status","input":{"n":' + i + '}}');
  const r = await runAgentToolLoop({ env: ai(replies), bus: bus(calls), text: 'teste tout' });
  assert.equal(r[0].error, 'AGENT_TOOL_NOT_ALLOWED');
  assert.ok(r.length <= AGENT_MAX_STEPS);
  assert.ok(!calls.some(([id]) => id === 'payments.send'));
});

test('plain text from the model means no tool', () => {
  assert.deepEqual(parseAgentAction('Bonjour Adrien'), { final: true });
});

test('plain conversation makes no extra model call', async () => {
  let n = 0;
  const r = await runAgentToolLoop({ env: { AI: { async run() { n += 1; return { response: '{"final":true}' }; } } }, bus: bus([]), text: 'Bonjour, ça va ?' });
  assert.deepEqual(r, []);
  assert.equal(n, 0);
});

test('arguments is accepted as the tool input and a bare JSON call is recognized', () => {
  assert.deepEqual(parseAgentAction('{"tool":"gmail.messages.search","arguments":{"query":"in:inbox","maxResults":5}}'), {
    tool: 'gmail.messages.search',
    input: { query: 'in:inbox', maxResults: 5 },
  });
});

test('a gmail read requested with arguments is executed, not left as text', async () => {
  const calls = [];
  const localBus = {
    list: () => ['gmail.messages.search', 'calendar.events.read', 'drive.files.list'].map(id => ({ id, description: id, input_schema: { type: 'object' } })),
    async execute(id, input) { calls.push([id, input]); return { ok: true, id }; },
  };
  const r = await runAgentToolLoop({
    env: ai(['{"tool":"gmail.messages.search","arguments":{"query":"in:inbox","maxResults":5}}', '{"final":true}']),
    bus: localBus,
    text: 'teste réellement Gmail',
  });
  assert.deepEqual(calls, [['gmail.messages.search', { query: 'in:inbox', maxResults: 5 }]]);
  assert.equal(r[0].status, 'SUCCEEDED');
});

test('only a whole JSON tool call counts as a bare call', () => {
  assert.equal(responseIsBareToolCall('{"tool":"gmail.messages.search","arguments":{}}'), true);
  assert.equal(responseIsBareToolCall('Voici le résultat.\n{"tool":"gmail.messages.search"}'), false);
});

test('a tool JSON glued to the answer is removed and a missed read is executed once', async () => {
  const calls = [];
  const bus = {
    async execute(id, input) { calls.push([id, input]); return { count: 5 }; },
  };
  const text = 'Je lance la lecture.\n{"tool":"gmail.messages.search","arguments":{"query":"in:inbox","maxResults":5}}';
  assert.equal(stripLeakedToolCalls(text), 'Je lance la lecture.');
  const rows = await executeLeakedReads({ bus, text, already: [] });
  assert.deepEqual(calls, [['gmail.messages.search', { query: 'in:inbox', maxResults: 5 }]]);
  assert.equal(rows[0].status, 'SUCCEEDED');
  const again = await executeLeakedReads({ bus, text, already: rows });
  assert.equal(again.length, 0);
  assert.equal(calls.length, 1);
  const mutation = await executeLeakedReads({ bus, text: '{"tool":"evolution.enqueue","input":{"goal":"x"}}' });
  assert.equal(mutation.length, 0);
});

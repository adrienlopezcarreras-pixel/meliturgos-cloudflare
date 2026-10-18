import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgentToolLoop, parseAgentAction, AGENT_MAX_STEPS } from '../src/api/agent-tools.js';

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

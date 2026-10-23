import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAgentAction, responseIsBareToolCall, stripLeakedToolCalls, executeLeakedReads } from '../src/api/agent-tools.js';

// Production chat (Code mode, nemotron) answered with `{ "autonomy.status": {} }`
// shown as raw JSON instead of executing the read and answering.
test('shorthand {"capability.id": {input}} is a tool call: executed, never shown as raw JSON', async () => {
  const reply = '{\n"autonomy.status": {}\n}';
  assert.deepEqual(parseAgentAction(reply), { tool: 'autonomy.status', input: {} });
  assert.equal(responseIsBareToolCall(reply), true);
  assert.equal(stripLeakedToolCalls(`Voici. ${reply}`), 'Voici.');
  const calls = [];
  const bus = { async execute(id, input) { calls.push([id, input]); return { ok: true }; } };
  const results = await executeLeakedReads({ bus, text: reply });
  assert.deepEqual(calls, [['autonomy.status', {}]]);
  assert.equal(results[0].status, 'SUCCEEDED');
  // Ordinary JSON data is not mistaken for a call.
  assert.deepEqual(parseAgentAction('{"total": 3}'), { final: true });
  assert.deepEqual(parseAgentAction('{"a.b": 3}'), { final: true });
  assert.deepEqual(parseAgentAction('{"a.b": {}, "c": 1}'), { final: true });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContext, boundRecentMessages } from '../src/core/orchestrator/context-builder.js';

test('recent context keeps newest messages within budget in chronological order', () => {
  const recent = [
    { role: 'user', content: 'A'.repeat(3000) },
    { role: 'assistant', content: 'B'.repeat(3000) },
    { role: 'user', content: 'C'.repeat(3000) },
  ];
  const bounded = boundRecentMessages(recent, { totalChars: 5000, perMessageChars: 3000 });
  assert.equal(bounded.omitted, 2);
  assert.equal(bounded.messages.length, 1);
  assert.match(bounded.messages[0].content, /^C/);
});

test('oversized historical message keeps both beginning and end', () => {
  const content = `BEGIN-${'x'.repeat(20000)}-END`;
  const bounded = boundRecentMessages([{ role: 'assistant', content }], { totalChars: 6000, perMessageChars: 5000 });
  assert.equal(bounded.messages.length, 1);
  assert.match(bounded.messages[0].content, /^BEGIN-/);
  assert.match(bounded.messages[0].content, /-END$/);
  assert.match(bounded.messages[0].content, /CONTEXTE PARTIEL/);
});

test('buildContext never truncates the current user prompt', () => {
  const current = 'CURRENT-'.repeat(15000);
  const messages = buildContext({
    system: 'system',
    recent: Array.from({ length: 20 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `${index}:` + 'z'.repeat(15000) })),
    toolResults: [],
    current,
  });
  assert.equal(messages.at(-1).role, 'user');
  assert.equal(messages.at(-1).content, current);
  assert.match(messages[0].content, /message\(s\) plus ancien\(s\)/);
});

test('buildContext bounds oversized tool results before model routing', () => {
  const messages = buildContext({
    system: 'system',
    toolResults: [{ capability: 'test', status: 'SUCCEEDED', result: { huge: 'q'.repeat(50000) } }],
    current: 'go',
  });
  assert.ok(messages[0].content.length < 25000);
  assert.match(messages[0].content, /CONTEXTE PARTIEL/);
});

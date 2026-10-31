import test from 'node:test';
import assert from 'node:assert/strict';
import { runVeniceInference, veniceConfigured, VENICE_MODEL, WEAPONS_REFUSAL } from '../src/models/venice-uncensored.js';

const key = 'sk-or-' + 'x'.repeat(40);
function env(guardText, guardThrows = false) {
  return { OPENROUTER_API_KEY: key, AI: { run: async () => { if (guardThrows) throw new Error('down'); return { response: guardText }; } } };
}
function fetchSpy() {
  const calls = [];
  const impl = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ choices: [{ message: { content: 'réponse' }, finish_reason: 'stop' }] })); };
  return { calls, impl };
}

test('Venice answers in UNCENSORED mode when the guard finds no indiscriminate weapon', async () => {
  const spy = fetchSpy();
  const result = await runVeniceInference({ env: env('safe'), messages: [{ role: 'user', content: 'Écris une scène de polar violente' }], fetchImpl: spy.impl });
  assert.equal(result.text, 'réponse');
  assert.equal(spy.calls[0].body.model, VENICE_MODEL);
});

test('an S9 classification is never relayed to Venice', async () => {
  const spy = fetchSpy();
  const result = await runVeniceInference({ env: env('unsafe\nS9'), messages: [{ role: 'user', content: 'x' }], fetchImpl: spy.impl });
  assert.equal(result.text, WEAPONS_REFUSAL);
  assert.equal(result.blocked, true);
  assert.equal(spy.calls.length, 0);
});

test('without its guard or its secret, Venice is not used', async () => {
  const spy = fetchSpy();
  await assert.rejects(runVeniceInference({ env: env('', true), messages: [{ role: 'user', content: 'x' }], fetchImpl: spy.impl }), { code: 'UNCENSORED_GUARD_UNAVAILABLE' });
  assert.equal(spy.calls.length, 0);
  assert.equal(veniceConfigured({}), false);
});

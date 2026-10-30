import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVerdict } from '../src/evolution/council-review.js';

// 30/10: gpt-oss-120b and gemma-4 reviews of FOUNDER-04 were UNPARSEABLE_REVIEW
// because the first-to-last brace match swallowed code and prose around them.
test('the verdict object is found among quoted code, fences and prose', () => {
  const text = 'Analyse : function f(){ return {a:1} }\n```json\n{"verdict":"REJECT","blocking":["test manquant {cas}"],"summary":"ok"}\n```\nFin {x}.';
  assert.deepEqual(parseVerdict(text), { verdict: 'REJECT', blocking: ['test manquant {cas}'], summary: 'ok' });
  assert.equal(parseVerdict('{"verdict":"MAYBE"}'), null);
  assert.equal(parseVerdict('pas de JSON'), null);
});

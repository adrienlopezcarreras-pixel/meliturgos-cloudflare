import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../src/pages/mvp-interface-v2.js';

test('simple MEL interface exposes a brief status button', async () => {
  const response = await onRequestGet({});
  const html = await response.text();
  assert.match(html, /id="melBriefStatus"/);
  assert.match(html, /Statut MEL/);
  assert.match(html, /compte rendu TRÈS BREF/);
  assert.match(html, /send\.click\(\)/);
});

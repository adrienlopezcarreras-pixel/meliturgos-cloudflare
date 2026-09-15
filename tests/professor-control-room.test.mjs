import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../src/pages/full-interface-v2.js';

test('professor renders the current MEL Control Room with consolidated experience', async () => {
  const response = await onRequestGet({});
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /MEL · Control Room/);
  assert.match(html, /orchestration visible/);
  assert.match(html, /Expérience projet/);
  assert.match(html, />48</);
  assert.match(html, /Multi-IA/);
  assert.match(html, /Travail et évolution/);
  assert.match(html, /melCurrentMax/);
  assert.match(html, /\/api\/professor\/dev\/jobs/);
  assert.doesNotMatch(html, /\/api\/professor\/dev\/autonomy\/next/);
});

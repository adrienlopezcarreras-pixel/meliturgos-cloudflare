import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../src/pages/full-interface-v2.js';

test('full mode overview reports MEL autonomy without duplicating the canonical top controls', async () => {
  const response = await onRequestGet();
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /id="autonomyBadge"/);
  assert.match(html, /id="autonomyMode"/);
  assert.match(html, /id="autonomyNext"/);
  assert.match(html, /\/api\/gen2\/autonomy\/state/);
  assert.doesNotMatch(html, /id="autonomyToggle"/);
  assert.doesNotMatch(html, /id="autonomyTick"/);
  assert.doesNotMatch(html, /id="melStartCycleTop"/);
  assert.doesNotMatch(html, /\/api\/gen2\/autonomy\/tick/);
  assert.match(html, /production verrouillée/i);
});

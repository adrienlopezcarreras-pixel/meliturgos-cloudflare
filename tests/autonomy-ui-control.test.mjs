import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../src/pages/full-interface-v2.js';

test('full mode exposes canonical MEL autonomy controls', async () => {
  const response = await onRequestGet();
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /id="autonomyToggle">Lancer la boucle MEL/);
  assert.match(html, /id="autonomyTick">Avancer maintenant/);
  assert.match(html, /\/api\/gen2\/autonomy\/resume/);
  assert.match(html, /\/api\/gen2\/autonomy\/max/);
  assert.match(html, /\/api\/gen2\/autonomy\/pause/);
  assert.match(html, /\/api\/gen2\/autonomy\/tick/);
  assert.match(html, /production verrouillée/i);
});

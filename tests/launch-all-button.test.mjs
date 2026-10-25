import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('one button activates MAX, runs the capability watch and starts a MEL cycle', () => {
  const page = readFileSync('src/pages/full-interface-v2.js', 'utf8');
  assert.match(page, /id="melFullLaunchAll"[^>]*>🚀 Tout lancer<\/button>/);
  const handler = page.slice(page.indexOf("launchAll.onclick"));
  const order = ['/api/gen2/autonomy/max', '/api/mel/capability-watch/run', '/api/gen2/autonomy/tick'].map(url => handler.indexOf(url));
  assert.ok(order.every(i => i > 0) && order[0] < order[1] && order[1] < order[2]);
});

test('the LoRA page opens with a plain-language summary', () => {
  const page = readFileSync('src/pages/full-interface-v2.js', 'utf8');
  assert.match(page, /id="freeLoraPlain"/);
  assert.match(page, /Rien à faire de votre côté : tout est gratuit et automatique\./);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../src/pages/full-interface-v2.js';

test('full interface exposes the Waveshare terminal setup surface',async()=>{
  const r=await onRequestGet();
  const html=await r.text();
  assert.match(html,/data-view="terminal"/);
  assert.match(html,/data-panel="terminal"/);
  assert.match(html,/Créer un code d’appairage/);
  assert.match(html,/\/api\/device\/v1\/pair-code/);
  // The manual flashing script is superseded by the one-click Companion update.
  assert.match(html,/id="miniFlashCompanion"/);
  assert.doesNotMatch(html,/href="\/api\/device\/v1\/setup-script"/);
});

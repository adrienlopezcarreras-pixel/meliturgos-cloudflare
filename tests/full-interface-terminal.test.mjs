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
  assert.match(html,/\/api\/device\/v1\/setup-script/);
});

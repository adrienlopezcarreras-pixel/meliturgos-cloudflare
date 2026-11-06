import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../src/pages/full-interface-v2.js';

test('full interface exposes the Computer tab and installer',async()=>{
  const response=await onRequestGet();
  const html=await response.text();
  assert.match(html,/data-view="computer"/);
  assert.match(html,/data-panel="computer"/);
  assert.match(html,/\/api\/computer\/v1\/installer/);
  assert.match(html,/ARRÊTER LE CONTRÔLE/);
  assert.match(html,/computerScreen/);
});

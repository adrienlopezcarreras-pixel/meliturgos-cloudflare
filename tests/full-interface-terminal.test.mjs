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

// MEL-FOUNDER-06: the bench proves the protocol, never the device. The MINI
// surface must not present a software run as a validated physical device.
test('the MINI surface never presents the software bench as a validated device', async () => {
  const { MINI_PHYSICAL_RECIPE, runMiniProtocolBench, createMiniProtocolDouble } = await import('../src/devices/mini-usb-provision.js');
  assert.equal(MINI_PHYSICAL_RECIPE.validated, false);
  assert.ok(MINI_PHYSICAL_RECIPE.steps.length >= 4, 'the physical recipe stays written down, separate from the bench');
  const bench = await runMiniProtocolBench(createMiniProtocolDouble());
  assert.equal(bench.hardware_validated, false);
  assert.equal(bench.proves, 'PROTOCOL_ONLY');
});

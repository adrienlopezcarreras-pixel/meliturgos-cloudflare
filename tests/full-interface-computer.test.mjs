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

// MEL-UI-AUDIT-05: no software double may be presented as a physical test.
test('MEL-UI-AUDIT-05: the offline bench blocks the controls and never claims a physical test', async () => {
  const { hardwareControlVerdict, hardwareBenchReport } = await import('../scripts/ui-production-audit.mjs');
  const blocked = s => ({ control: 'shutdownBtn', companion_state: s, control_enabled: false, executed: false, used_double: true, claimed_physical: false });

  for (const state of ['OFFLINE', 'PERMISSION_DENIED', 'SHUTDOWN']) {
    const verdict = hardwareControlVerdict(blocked(state));
    assert.equal(verdict.status, 'PASS', state);
    assert.equal(verdict.blocked, true);
    assert.equal(verdict.proves, 'PROTOCOL_ONLY', 'a double proves the protocol, never the device');
  }
  assert.deepEqual(hardwareControlVerdict({ ...blocked('OFFLINE'), control_enabled: true }).problems, ['CONTROL_ENABLED_WHILE_OFFLINE']);
  assert.deepEqual(hardwareControlVerdict({ ...blocked('SHUTDOWN'), executed: true }).problems, ['ACTION_EXECUTED_WHILE_SHUTDOWN']);
  assert.deepEqual(hardwareControlVerdict({ ...blocked('OFFLINE'), claimed_physical: true }).problems, ['SOFTWARE_DOUBLE_CLAIMED_AS_PHYSICAL']);

  const full = hardwareBenchReport(['OFFLINE', 'PERMISSION_DENIED', 'SHUTDOWN'].map(blocked));
  assert.equal(full.conclusive, true);
  assert.equal(full.hardware_validated, false, 'an offline bench never validates hardware');
  assert.equal(hardwareBenchReport([blocked('OFFLINE')]).conclusive, false, 'one state covered is not the recipe');
});

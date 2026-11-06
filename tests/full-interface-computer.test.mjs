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

test('offline hardware recipe blocks missing evidence and never performs a device command',async()=>{
 const {offlineHardwareControlReceipt}=await import('../scripts/ui-production-audit.mjs');
 const report=offlineHardwareControlReceipt([
   {control:'screen',online:false,code:'COMPUTER_OFFLINE'},
   {control:'keyboard',permission:'DENIED'},
   {control:'mouse',halted:true},
   {control:'stop',source:'mock',status:'SUCCESS',ok:true,
     physical_receipt:{kind:'ON_DEVICE_OBSERVED',control:'stop',device_id:'test',observed_at:5}}
 ]);
 assert.equal(report.schema,'mel.ui-hardware-offline-receipt/v1');
 assert.deepEqual(report.controls.map(x=>x.reason),
   ['COMPUTER_OFFLINE','PERMISSION_DENIED','OWNER_STOPPED','PHYSICAL_PROOF_MISSING']);
 assert.equal(report.pass,0);
 assert.equal(report.blocked,4);
 assert.equal(report.mutations_performed,0);
 assert.equal(report.simulated_physical_passes,0);
});

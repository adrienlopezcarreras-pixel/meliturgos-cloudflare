import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
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

test('software-only recipe executes the real UI guards without dispatching hardware commands',async()=>{
 const html=await(await onRequestGet()).text();
 const selected=html.slice(html.indexOf('function selectedComputer()'),html.indexOf('function fmtSeen('));
 const readiness=html.slice(html.indexOf('function companionDesktopReadiness('),html.indexOf('function renderComputer('));
 const command=html.slice(html.indexOf('async function computerCommand('),html.indexOf("qs('#computerRefresh').onclick="));
 assert.ok(selected&&readiness&&command,'exercise the functions shipped in the real page');
 const now=Date.now();
 const healthy={id:'software-fixture',online:true,halted:false,last_seen_at:now,
  metadata:{remote_access_enabled:true,engine_heartbeat_at:now,engine_direct_heartbeat_at:now}};
 const cases=[
  ['COMPUTER_DEVICE_OFFLINE',{...healthy,online:false}],
  ['REMOTE_ACCESS_DISABLED_LOCALLY',{...healthy,metadata:{...healthy.metadata,remote_access_enabled:false}}],
  ['OWNER_HALT_ACTIVE',{...healthy,halted:true}],
 ];
 let requests=0;
 for(const [code,device] of cases){
  const context={computerCache:{devices:[device]},Date,Number,Error,
   qs:()=>({value:''}),jfetch:async()=>{requests++;throw Error('MUST_NOT_DISPATCH');}};
  const api=runInNewContext(selected+'\n'+readiness+'\n'+command+'\n({computerCommand,companionDesktopReadiness})',context,{timeout:1000});
  assert.equal(api.companionDesktopReadiness(device,now).code,code);
  for(const steps of [[{action:'screen.capture'}],[{action:'app.open',app:'notepad'}],
   [{action:'keyboard.type',text:'software guard recipe'}]])
   await assert.rejects(()=>api.computerCommand(steps,steps[0].action!=='screen.capture'),error=>error.message===code);
  assert.equal(requests,0,'offline, denied and halted UI paths cannot reach the command API');
  assert.equal(api.companionDesktopReadiness(healthy,now).ok,true,'the healthy control path remains available');
 }
 // This is a software guard recipe over the real UI source, not a PC capture.
 assert.equal(requests,0);
});

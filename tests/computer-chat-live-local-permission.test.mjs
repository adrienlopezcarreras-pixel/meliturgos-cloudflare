import test from 'node:test';
import assert from 'node:assert/strict';
import {registerComputerRuntimeCapabilities} from '../src/capabilities/computer-runtime-capabilities.js';
import {CapabilityBus} from '../src/capabilities/capability-bus.js';
import {sqliteD1} from './helpers/sqlite-d1.mjs';

function fixture(){
 const db=sqliteD1(),actions=new Map(),health=new Map();
 const bus={discover(meta,handler,probe){actions.set(meta.id,handler);health.set(meta.id,probe)}};
 registerComputerRuntimeCapabilities(bus,{db});
 return {db,actions,health};
}
async function device(db,{id,seen=Date.now(),engine=Date.now(),grant=true,halted=0,platform='windows'}){
 const metadata=JSON.stringify({remote_access_enabled:grant,engine_heartbeat_at:engine,allowed_paths:[]});
 await db.prepare('INSERT INTO computer_devices(id,token_hash,name,platform,capabilities,allowed_apps,halted,created_at,last_seen_at,metadata) VALUES(?,?,?,?,?,?,?,?,?,?)')
  .bind(id,'hash-'+id,id,platform,JSON.stringify(['computer.use']),JSON.stringify(['notepad']),halted,Date.now(),seen,metadata).run();
}
async function set(db,id,{seen=Date.now(),engine=Date.now(),grant=true,halted=0}={}){
 await db.prepare('UPDATE computer_devices SET last_seen_at=?,metadata=?,halted=? WHERE id=?')
  .bind(seen,JSON.stringify({remote_access_enabled:grant,engine_heartbeat_at:engine,allowed_paths:[]}),halted,id).run();
}

test('computer.status remains usable to explain offline/local-consent state without enabling control',async()=>{
 const {db,actions,health}=fixture();
 try{
  assert.equal(await health.get('computer.status')(),'ONLINE');
  assert.equal((await actions.get('computer.status')({})).devices.length,0);
  await device(db,{id:'pc-status',grant:false});
  assert.equal(await health.get('computer.status')(),'ONLINE');
  const status=await actions.get('computer.status')({});
  assert.equal(status.devices.length,1);
  assert.equal(status.devices[0].remote_access_issue,'REMOTE_ACCESS_DISABLED_LOCALLY');
  assert.equal((await health.get('computer.quick')()).status,'OFFLINE');
  assert.equal((await health.get('computer.quick')()).reason,'REMOTE_ACCESS_DISABLED_LOCALLY');
  assert.equal((await health.get('computer.execute')()).status,'OFFLINE');
  assert.equal((await health.get('computer.execute')()).reason,'REMOTE_ACCESS_DISABLED_LOCALLY');
  await set(db,'pc-status',{});
  const enabled=await actions.get('computer.status')({});
  assert.equal(enabled.devices[0].remote_access_issue,null);
  assert.equal((await health.get('computer.quick')()).status,'ONLINE');
 }finally{db.close();}
});

test('chat quick screenshot chooses authorized online PC, not a closer but unauthorized PC',async()=>{
 const {db,actions,health}=fixture();
 try{
  await actions.get('computer.status')({});
  await device(db,{id:'pc-owner',seen:Date.now()-2000,engine:Date.now()-2000,grant:true});
  await device(db,{id:'pc-not-approved',seen:Date.now(),engine:Date.now(),grant:false});
  assert.equal((await health.get('computer.quick')()).status,'ONLINE');
  const result=await actions.get('computer.quick')({kind:'screenshot'});
  assert.equal(result.status,'PENDING');
  assert.equal(result.device_id,'pc-owner');
  const row=await db.prepare('SELECT plan_json FROM computer_commands WHERE id=?').bind(result.command_id).first();
  assert.deepEqual(JSON.parse(row.plan_json).steps.map(x=>x.action),['screen.capture']);
 }finally{db.close();}
});

test('quick and explicit chat commands fail closed without current Windows local grant and live engine',async()=>{
 const {db,actions,health}=fixture();
 try{
  await actions.get('computer.status')({});
  await device(db,{id:'pc-chat',grant:false});
  assert.equal((await health.get('computer.quick')()).status,'OFFLINE');
  await assert.rejects(actions.get('computer.quick')({kind:'screenshot'}),
   x=>x.code==='COMPUTER_NO_AUTHORIZED_ONLINE_DEVICE');
  await assert.rejects(actions.get('computer.execute')({computer_id:'pc-chat',steps:[{action:'screen.capture'}]}),
   x=>x.code==='REMOTE_ACCESS_DISABLED_LOCALLY');
  await set(db,'pc-chat',{engine:Date.now()-60_000});
  const staleEngine=await health.get('computer.execute')();
  assert.equal(staleEngine.status,'OFFLINE');
  assert.equal(staleEngine.reason,'COMPUTER_ENGINE_OFFLINE');
  await assert.rejects(actions.get('computer.execute')({computer_id:'pc-chat',steps:[{action:'screen.capture'}]}),
   x=>x.code==='COMPUTER_ENGINE_OFFLINE');
  await set(db,'pc-chat',{seen:Date.now()-60_000});
  const staleDevice=await health.get('computer.execute')();
  assert.equal(staleDevice.status,'OFFLINE');
  assert.equal(staleDevice.reason,'COMPUTER_OFFLINE');
  await assert.rejects(actions.get('computer.execute')({computer_id:'pc-chat',steps:[{action:'screen.capture'}]}),
   x=>x.code==='COMPUTER_OFFLINE');
  await set(db,'pc-chat',{halted:1});
  const halted=await health.get('computer.execute')();
  assert.equal(halted.status,'OFFLINE');
  assert.equal(halted.reason,'OWNER_HALT_ACTIVE');
  await assert.rejects(actions.get('computer.execute')({computer_id:'pc-chat',steps:[{action:'screen.capture'}]}),
   x=>x.code==='OWNER_HALT_ACTIVE');
  await set(db,'pc-chat',{});
  assert.equal((await health.get('computer.quick')()).status,'ONLINE');
  const executed=await actions.get('computer.execute')({computer_id:'pc-chat',steps:[{action:'screen.capture'}]});
  assert.equal(executed.status,'PENDING');
  const records=await db.prepare('SELECT * FROM computer_commands').all();
  assert.equal(records.results.length,1,'Rejected calls must not enqueue any commands');
 }finally{db.close();}
});

test('CapabilityBus exposes safe actionable health detail for blocked desktop control',async()=>{
 const db=sqliteD1(),bus=new CapabilityBus();
 registerComputerRuntimeCapabilities(bus,{db});
 try{
  // Initialize the D1 schema through the public capability before seeding fixtures.
  await bus.execute('computer.status',{}, {owner:'owner'});
  await device(db,{id:'pc-health',grant:false});
  let row=await bus.refreshHealth('computer.execute');
  assert.equal(row.health,'UNAVAILABLE');
  assert.equal(row.health_detail,'REMOTE_ACCESS_DISABLED_LOCALLY');
  await set(db,'pc-health',{engine:Date.now()-60_000});
  row=await bus.refreshHealth('computer.quick');
  assert.equal(row.health,'UNAVAILABLE');
  assert.equal(row.health_detail,'COMPUTER_ENGINE_OFFLINE');
  await set(db,'pc-health',{halted:1});
  row=await bus.refreshHealth('computer.execute');
  assert.equal(row.health,'UNAVAILABLE');
  assert.equal(row.health_detail,'OWNER_HALT_ACTIVE');
  assert.equal(JSON.stringify(bus.list()).includes('private'),false);
 }finally{db.close();}
});

test('chat quick cannot silently select a non-Windows platform',async()=>{
 const {db,actions,health}=fixture();
 try{
  await actions.get('computer.status')({});
  await device(db,{id:'android-decoy',platform:'android',grant:true});
  assert.equal((await health.get('computer.quick')()).status,'OFFLINE');
  await assert.rejects(actions.get('computer.quick')({kind:'click',x:10,y:20}),
   x=>x.code==='COMPUTER_NO_AUTHORIZED_ONLINE_DEVICE');
 }finally{db.close();}
});

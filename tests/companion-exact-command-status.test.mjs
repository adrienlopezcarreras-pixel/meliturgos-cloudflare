import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { maybeHandleComputerApi } from '../src/devices/computer-companion-api.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const auth='Basic '+Buffer.from('adrien:test').toString('base64');
const envFor=db=>({DB:db,MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'});
const req=path=>new Request('https://mel.test'+path,{headers:{authorization:auth}});
const uuid=n=>'00000000-0000-4000-8000-'+n.toString(16).padStart(12,'0');

test('owner exact command lookup survives >30 newer commands without leaking other PC history',async()=>{
 const db=sqliteD1();
 const env=envFor(db);
 try{
  const init=await maybeHandleComputerApi(req('/api/computer/v1/status'),env);
  assert.equal(init.status,200);
  const now=Date.now();
  for(const id of ['pc-a','pc-b']){
   await db.prepare('INSERT INTO computer_devices(id,token_hash,name,platform,capabilities,allowed_apps,halted,created_at,last_seen_at,metadata) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(id,'hash-'+id,id,'windows','["computer.use"]','["notepad"]',0,now,now,
      JSON.stringify({remote_access_enabled:true,engine_heartbeat_at:now})).run();
  }
  for(let n=1;n<=44;n++){
   await db.prepare('INSERT INTO computer_commands(id,device_id,session_id,plan_json,status,created_at) VALUES(?,?,?,?,?,?)')
    .bind(uuid(n),n===44?'pc-b':'pc-a','s','{}',n===1?'SUCCEEDED':'PENDING',now+n).run();
  }
  const ordinary=await maybeHandleComputerApi(req('/api/computer/v1/status?computer_id=pc-a'),env);
  const old=(await ordinary.json()).commands;
  assert.equal(old.length,30);
  assert.ok(!old.some(item=>item.id===uuid(1)),'legacy 30-command history evicts the original capture');

  const exact=await maybeHandleComputerApi(req('/api/computer/v1/status?computer_id=pc-a&command_id='+uuid(1)),env);
  assert.equal(exact.status,200);
  assert.deepEqual((await exact.json()).commands.map(item=>({id:item.id,status:item.status})),[{id:uuid(1),status:'SUCCEEDED'}]);

  const other=await maybeHandleComputerApi(req('/api/computer/v1/status?computer_id=pc-a&command_id='+uuid(44)),env);
  assert.equal(other.status,200);
  assert.deepEqual((await other.json()).commands,[],'exact ID is strictly bound to requested PC');

  const bad=await maybeHandleComputerApi(req('/api/computer/v1/status?computer_id=pc-a&command_id=not-a-uuid'),env);
  assert.equal(bad.status,400);
  assert.equal((await bad.json()).code,'COMPUTER_COMMAND_ID_INVALID');
  const missingDevice=await maybeHandleComputerApi(req('/api/computer/v1/status?command_id='+uuid(1)),env);
  assert.equal(missingDevice.status,400);
  assert.equal((await missingDevice.json()).code,'COMPUTER_ID_REQUIRED_FOR_COMMAND_LOOKUP');
  const unauthorized=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/status?computer_id=pc-a&command_id='+uuid(1)),env);
  assert.equal(unauthorized.status,401);
 }finally{db.close()}
});

test('MEL full interface tracks the exact PC command ID in both chat and desktop UI',async()=>{
 const source=await readFile(new URL('../src/pages/full-interface-v2.js',import.meta.url),'utf8');
 assert.ok(source.includes("'&command_id='+encodeURIComponent(commandId)+'&chat_capture_poll='"));
 assert.ok(source.includes("'&command_id='+encodeURIComponent(queued.command_id)+'&command_poll='"));
});

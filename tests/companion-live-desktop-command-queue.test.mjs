import test from 'node:test';
import assert from 'node:assert/strict';
import { maybeHandleComputerApi } from '../src/devices/computer-companion-api.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const authorization='Basic '+Buffer.from('adrien:test').toString('base64');
const path='https://mel.test/api/computer/v1';
function request(pathname,body=null,authenticated=true){
 return new Request(path+pathname,{
  method:body?'POST':'GET',
  headers:{...(authenticated?{authorization}:{}),...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
}
async function seed(db){
 await maybeHandleComputerApi(request('/status'),{DB:db,MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'});
 const now=Date.now();
 await db.prepare('INSERT INTO computer_devices(id,token_hash,name,platform,capabilities,allowed_apps,halted,created_at,last_seen_at,metadata) VALUES(?,?,?,?,?,?,?,?,?,?)')
  .bind('win-1','token','Windows PC','windows',JSON.stringify(['computer.use']),JSON.stringify(['notepad']),0,now,now,
   JSON.stringify({remote_access_enabled:true,engine_heartbeat_at:now,screen:{x:0,y:0,width:1920,height:1080}})).run();
}
test('owner desktop commands fail fast before queue if remote engine is absent, stale, or locally denied',async()=>{
 const db=sqliteD1();
 const env={DB:db,MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'};
 try{
  await seed(db);
  const capture=()=>maybeHandleComputerApi(request('/commands',{computer_id:'win-1',steps:[{action:'screen.capture'}]}),env);
  const set=async({remote=true,engine=Date.now(),last=Date.now()}={})=>{
   await db.prepare('UPDATE computer_devices SET metadata=?,last_seen_at=? WHERE id=?')
    .bind(JSON.stringify({remote_access_enabled:remote,engine_heartbeat_at:engine}),last,'win-1').run();
  };
  let response=await capture();
  assert.equal(response.status,202);
  let data=await response.json();
  assert.equal(data.status,'PENDING');
  assert.ok(data.command_id);
  await set({engine:Date.now()-60000});
  response=await capture();
  assert.equal(response.status,409);
  assert.equal((await response.json()).code,'COMPUTER_ENGINE_OFFLINE');
  await set({remote:false});
  response=await capture();
  assert.equal(response.status,403);
  assert.equal((await response.json()).code,'REMOTE_ACCESS_DISABLED_LOCALLY');
  await set({last:Date.now()-60000});
  response=await capture();
  assert.equal(response.status,409);
  assert.equal((await response.json()).code,'COMPUTER_DEVICE_OFFLINE');
  await set({engine:Date.now()+60000});
  response=await capture();
  assert.equal(response.status,409);
  assert.equal((await response.json()).code,'COMPUTER_ENGINE_OFFLINE');
  const rows=await db.prepare('SELECT id FROM computer_commands WHERE device_id=?').bind('win-1').all();
  assert.equal(rows.results.length,1,'rejected requests must never create durable pending commands');
  response=await maybeHandleComputerApi(request('/commands',{computer_id:'win-1',steps:[{action:'screen.capture'}]},false),env);
  assert.equal(response.status,401);
 }finally{db.close()}
});

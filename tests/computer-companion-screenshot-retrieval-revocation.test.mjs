import test from 'node:test';
import assert from 'node:assert/strict';
import {maybeHandleComputerApi} from '../src/devices/computer-companion-api.js';
import {sqliteD1} from './helpers/sqlite-d1.mjs';

test('owner screenshot GET honors per-device HALT, prior opt-in, and full revoke',async()=>{
 const DB=sqliteD1();
 const reads=[];
 const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
 const env={DB,MELITURGOS_USER:'owner',MELITURGOS_PASSWORD:'secret',
  MEDIA_BUCKET:{async get(key){reads.push(key);return {body:png}}}};
 const owner='Basic '+Buffer.from('owner:secret').toString('base64');
 const base='https://mel.test/api/computer/v1/';
 const invoke=(path,auth=owner)=>maybeHandleComputerApi(new Request(base+path,{headers:auth?{authorization:auth}:{}}),env);
 const post=(path,body)=>maybeHandleComputerApi(new Request(base+path,{method:'POST',
  headers:{authorization:owner,'content-type':'application/json'},body:JSON.stringify(body)}),env);
 try{
  const codeResponse=await post('pair-code',{});
  assert.equal(codeResponse.status,200);
  const {code}=await codeResponse.json();
  const paired=await maybeHandleComputerApi(new Request(base+'pair',{method:'POST',
   headers:{'content-type':'application/json'},
   body:JSON.stringify({pair_code:code,computer_id:'screen-pc',platform:'windows'})}),env);
  assert.equal(paired.status,200);
  const now=Date.now();
  await DB.prepare("INSERT INTO computer_commands(id,device_id,session_id,plan_json,status,created_at) VALUES(?,?,?,?,?,?)")
   .bind('legacy-cmd','screen-pc','s','{}','SUCCEEDED',now).run();
  await DB.prepare("UPDATE computer_devices SET metadata=? WHERE id=?")
   .bind(JSON.stringify({remote_access_enabled:true}),'screen-pc').run();
  const key='computer/screenshots/screen-pc/legacy-cmd.png';
  const query='screenshot?key='+encodeURIComponent(key);
  assert.equal((await invoke(query,null)).status,401);
  assert.equal((await invoke('screenshot?key='+encodeURIComponent('computer/screenshots/../../private'))).status,400);
  assert.equal((await invoke('screenshot?key='+encodeURIComponent('computer/screenshots/another-pc/legacy-cmd.png'))).status,404);
  assert.deepEqual(reads,[]);

  let response=await invoke(query);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()),png);
  assert.deepEqual(reads,[key]);

  await DB.prepare("UPDATE computer_devices SET halted=1 WHERE id=?").bind('screen-pc').run();
  response=await invoke(query);
  assert.equal(response.status,409);
  assert.equal((await response.json()).code,'SCREENSHOT_OWNER_HALT');
  assert.equal(reads.length,1);

  await DB.prepare("UPDATE computer_devices SET halted=0,metadata=? WHERE id=?")
   .bind(JSON.stringify({remote_access_enabled:false}),'screen-pc').run();
  response=await invoke(query);
  assert.equal(response.status,409);
  assert.equal((await response.json()).code,'SCREENSHOT_LOCAL_ACCESS_REVOKED');
  assert.equal(reads.length,1);
  await DB.prepare("UPDATE computer_devices SET metadata=? WHERE id=?")
   .bind(JSON.stringify({remote_access_enabled:true}),'screen-pc').run();

  const revoked=await post('revoke',{computer_id:'screen-pc'});
  assert.equal(revoked.status,200);
  response=await invoke(query);
  assert.equal(response.status,404);
  assert.equal((await response.json()).code,'SCREENSHOT_ACCESS_REVOKED_OR_UNKNOWN');
  assert.equal(reads.length,1);
 }finally{DB.close();}
});

test('consented desktop view image expires and cannot be retrieved after failed command',async()=>{
 const DB=sqliteD1();
 let reads=0;
 const env={DB,MELITURGOS_USER:'owner',MELITURGOS_PASSWORD:'secret',
  MEDIA_BUCKET:{async get(){reads++;return {body:new Uint8Array([137,80,78,71,13,10,26,10])}}}};
 const owner='Basic '+Buffer.from('owner:secret').toString('base64');
 const base='https://mel.test/api/computer/v1/';
 const get=key=>maybeHandleComputerApi(new Request(base+'screenshot?key='+encodeURIComponent(key),
  {headers:{authorization:owner}}),env);
 try{
  const codeResponse=await maybeHandleComputerApi(new Request(base+'pair-code',{method:'POST',
   headers:{authorization:owner,'content-type':'application/json'},body:'{}'}),env);
  const {code}=await codeResponse.json();
  const paired=await maybeHandleComputerApi(new Request(base+'pair',{method:'POST',
   headers:{'content-type':'application/json'},body:JSON.stringify({pair_code:code,computer_id:'desktop-pc',platform:'windows'})}),env);
  assert.equal(paired.status,200);
  const plan={schema:'mel.companion.desktop-view-request/v1',action:'desktop.view.request',
   screen_capture_only:true,requires_local_stop:true,device_id:'desktop-pc',
   session_id:'session-123',expires_at:Date.now()+120000};
  await DB.prepare("INSERT INTO computer_commands(id,device_id,session_id,plan_json,status,created_at) VALUES(?,?,?,?,?,?)")
   .bind('view-cmd','desktop-pc','session-123',JSON.stringify(plan),'SUCCEEDED',Date.now()).run();
  const key='computer/screenshots/desktop-pc/view-cmd.png';
  assert.equal((await get(key)).status,200);
  assert.equal(reads,1);
  await DB.prepare("UPDATE computer_commands SET plan_json=? WHERE id=?")
   .bind(JSON.stringify({...plan,expires_at:Date.now()-1000}),'view-cmd').run();
  let response=await get(key);
  assert.equal(response.status,409);
  assert.equal((await response.json()).code,'SCREENSHOT_VIEW_EXPIRED_OR_REVOKED');
  assert.equal(reads,1);
  await DB.prepare("UPDATE computer_commands SET plan_json=?,status='FAILED' WHERE id=?")
   .bind(JSON.stringify(plan),'view-cmd').run();
  assert.equal((await get(key)).status,404);
  assert.equal(reads,1);
 }finally{DB.close();}
});

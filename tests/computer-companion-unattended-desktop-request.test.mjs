import test from 'node:test';
import assert from 'node:assert/strict';
import {maybeHandleComputerApi} from '../src/devices/computer-companion-api.js';
import {sqliteD1} from './helpers/sqlite-d1.mjs';

const root='https://mel.test/api/computer/v1/';
const owner='Basic '+Buffer.from('owner:secret').toString('base64');
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);

async function fixture(){
 const DB=sqliteD1(),objects=new Map();
 const env={DB,MELITURGOS_USER:'owner',MELITURGOS_PASSWORD:'secret',
  MEDIA_BUCKET:{
   async put(key,bytes){objects.set(key,Uint8Array.from(bytes))},
   async head(key){const data=objects.get(key);return data?{size:data.length}:null},
   async get(key){const data=objects.get(key);return data?{body:data}:null}
  }};
 const call=(path,{method='GET',body,auth=owner,headers={}}={})=>
  maybeHandleComputerApi(new Request(root+path,{method,
   headers:{...(auth?{authorization:auth}:{}),...(body?{'content-type':'application/json'}:{}),...headers},
   ...(body?{body:JSON.stringify(body)}:{})}),env);
 const codeRes=await call('pair-code',{method:'POST',body:{}});
 assert.equal(codeRes.status,200);
 const {code}=await codeRes.json();
 const paired=await call('pair',{method:'POST',auth:null,body:{pair_code:code,computer_id:'remote-pc',platform:'windows'}});
 assert.equal(paired.status,200);
 const {token}=await paired.json();
 const deviceHeaders={authorization:'Bearer '+token,'x-mel-computer-id':'remote-pc'};
 const grant=async({enabled=true,seen=Date.now(),engine=Date.now(),halted=0}={})=>{
  await DB.prepare('UPDATE computer_devices SET metadata=?,last_seen_at=?,halted=? WHERE id=?')
   .bind(JSON.stringify({remote_access_enabled:enabled,engine_heartbeat_at:engine}),seen,halted,'remote-pc').run();
 };
 await grant();
 return {DB,call,env,objects,deviceHeaders,grant};
}

test('owner can request exactly one unattended remote view and retrieve proven PNG',async()=>{
 const {DB,call,objects,deviceHeaders}=await fixture();
 try{
  const request=await call('desktop-view-request',{method:'POST',
   body:{computer_id:'remote-pc',steps:[{action:'keyboard.type'}],local_approved:true}});
  assert.equal(request.status,202);
  const queued=await request.json();
  assert.equal(queued.ok,true);
  assert.equal(queued.status,'PENDING');
  assert.ok(queued.expires_at-Date.now()>30_000&&queued.expires_at-Date.now()<=90_000);
  const record=await DB.prepare('SELECT plan_json,status FROM computer_commands WHERE id=?')
   .bind(queued.command_id).first();
  const plan=JSON.parse(record.plan_json);
  assert.equal(record.status,'PENDING');
  assert.equal(plan.schema,'mel.companion.desktop-view-request/v1');
  assert.equal(plan.screen_capture_only,true);
  assert.equal(plan.requires_local_stop,true);
  assert.equal(plan.action,'desktop.view.request');
  assert.equal(plan.device_id,'remote-pc');
  assert.deepEqual(plan.steps,undefined);
  assert.equal(plan.local_approved,undefined);
  const claim=await call('commands',{auth:deviceHeaders.authorization,headers:{'x-mel-computer-id':'remote-pc'}});
  assert.equal(claim.status,200);
  const issued=await claim.json();
  assert.equal(issued.command.id,queued.command_id);
  assert.equal(issued.command.plan.action,'desktop.view.request');
  const key='computer/screenshots/remote-pc/'+queued.command_id+'.png';
  const shot=await maybeHandleComputerApi(new Request(
   root+'screenshot?command_id='+encodeURIComponent(queued.command_id),
   {method:'POST',headers:{...deviceHeaders,'content-type':'image/png'},body:png}),{...{DB},...{MEDIA_BUCKET:objects?{async put(k,bytes){objects.set(k,Uint8Array.from(bytes))},async head(k){const x=objects.get(k);return x?{size:x.length}:null},async get(k){const x=objects.get(k);return x?{body:x}:null}}:null}});
  assert.equal(shot.status,200);
  assert.equal((await shot.json()).key,key);
  const screenshotUrl=root+'screenshot?key='+encodeURIComponent(key);
  const result=await call('result',{method:'POST',auth:deviceHeaders.authorization,
   headers:{'x-mel-computer-id':'remote-pc'},
   body:{command_id:queued.command_id,ok:true,result:{outputs:[{action:'desktop.view.request',
    screenshot_key:key,view_url:screenshotUrl}],capture_count:1}}});
  assert.equal(result.status,200);
  const status=await call('status?computer_id=remote-pc');
  assert.equal(status.status,200);
  const listing=await status.json();
  const done=listing.commands.find(x=>x.id===queued.command_id);
  assert.equal(done.status,'SUCCEEDED');
  assert.equal(done.result.outputs[0].view_url,screenshotUrl);
  const image=await call('screenshot?key='+encodeURIComponent(key));
  assert.equal(image.status,200);
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()),png);
 }finally{DB.close();}
});

test('owner request requires authentication, a live locally-authorized PC and online engine',async()=>{
 const {DB,call,grant}=await fixture();
 try{
  const view=(computer_id='remote-pc',auth=owner)=>call('desktop-view-request',{method:'POST',auth,
   body:{computer_id,local_approved:true,screen_capture_only:true}});
  assert.equal((await view('remote-pc',null)).status,401);
  assert.equal((await view('missing-pc')).status,404);
  assert.equal((await view('remote-pc')).status,202);
  await grant({enabled:false});
  let response=await view();
  assert.equal(response.status,403);
  assert.equal((await response.json()).code,'REMOTE_ACCESS_DISABLED_LOCALLY');
  await grant({seen:Date.now()-45_000});
  response=await view();
  assert.equal(response.status,409);
  assert.equal((await response.json()).code,'DESKTOP_VIEW_DEVICE_OFFLINE');
  await grant({engine:Date.now()-60_000});
  response=await view();
  assert.equal(response.status,409);
  assert.equal((await response.json()).code,'DESKTOP_VIEW_ENGINE_OFFLINE');
  await grant({halted:1});
  response=await view();
  assert.equal(response.status,409);
  assert.equal((await response.json()).code,'OWNER_HALT_ACTIVE');
 }finally{DB.close();}
});

test('unattended view claim expires or HALT blocks before reaching the PC',async()=>{
 const {DB,call,deviceHeaders,grant}=await fixture();
 try{
  const queued=await call('desktop-view-request',{method:'POST',body:{computer_id:'remote-pc'}});
  const {command_id}=await queued.json();
  await grant({halted:1});
  const blocked=await call('commands',{auth:deviceHeaders.authorization,
   headers:{'x-mel-computer-id':'remote-pc'}});
  assert.equal((await blocked.json()).halted,true);
  await grant();
  await DB.prepare('UPDATE computer_commands SET plan_json=? WHERE id=?').bind(
   JSON.stringify({schema:'mel.companion.desktop-view-request/v1',action:'desktop.view.request',
    screen_capture_only:true,requires_local_stop:true,device_id:'remote-pc',
    session_id:'expired-session',expires_at:Date.now()-1000}),command_id).run();
  const expired=await call('commands',{auth:deviceHeaders.authorization,
   headers:{'x-mel-computer-id':'remote-pc'}});
  assert.equal(expired.status,200);
  assert.equal((await expired.json()).blocked_command.code,'DESKTOP_VIEW_EXPIRED');
 }finally{DB.close();}
});

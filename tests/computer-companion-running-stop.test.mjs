import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {maybeHandleComputerApi} from '../src/devices/computer-companion-api.js';
import {sqliteD1} from './helpers/sqlite-d1.mjs';

test('STOP cancels RUNNING work, rejects stale results after RESUME, and keeps device control private',async()=>{
 const DB=sqliteD1();
 try{
  const env={DB,MELITURGOS_USER:'owner',MELITURGOS_PASSWORD:'secret'};
  const owner='Basic '+Buffer.from('owner:secret').toString('base64');
  const call=(path,{method='GET',auth=owner,device,body}={})=>
   maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/'+path,{
    method,headers:{authorization:auth,...(device?{'x-mel-computer-id':device}:{}),
     ...(body!==undefined?{'content-type':'application/json'}:{})},
    ...(body!==undefined?{body:JSON.stringify(body)}:{})
   }),env);
  const pair=async id=>{
   const codeResponse=await call('pair-code',{method:'POST',body:{}});
   assert.equal(codeResponse.status,200);
   const {code}=await codeResponse.json();
   const paired=await call('pair',{method:'POST',auth:'',body:{pair_code:code,computer_id:id,platform:'windows'}});
   assert.equal(paired.status,200);
   return (await paired.json()).token;
  };
  const token=await pair('pc-running'),otherToken=await pair('another-pc');
  const deviceAuth='Bearer '+token;
  for(const [device,auth] of [['pc-running',deviceAuth],['another-pc','Bearer '+otherToken]]){
   assert.equal((await call('heartbeat',{method:'POST',auth,device,body:{remote_access_enabled:true,engine_version:'1.4.1',engine_heartbeat_at:Date.now()}})).status,200);
  }
  const q=await call('commands',{method:'POST',body:{computer_id:'pc-running',
   steps:[{id:'s',action:'cursor.move',x:2,y:3}]}});
  assert.equal(q.status,202);
  const {command_id}=await q.json();
  const control=()=>call('control-state?command_id='+encodeURIComponent(command_id),
   {auth:deviceAuth,device:'pc-running'});
  assert.equal((await control().then(r=>r.json())).permitted,false);
  const claim=await call('commands',{auth:deviceAuth,device:'pc-running'});
  assert.equal((await claim.json()).command.id,command_id);
  assert.equal((await control().then(r=>r.json())).permitted,true);
  const foreign=await call('control-state?command_id='+command_id,{auth:'Bearer '+otherToken,device:'another-pc'});
  assert.equal((await foreign.json()).permitted,false);
  const unauth=await call('control-state?command_id='+command_id,{auth:''});
  assert.equal(unauth.status,401);
  const stopped=await call('halt',{method:'POST',body:{computer_id:'pc-running'}});
  assert.equal(stopped.status,200);
  assert.equal((await stopped.json()).cancelled_running,1);
  const denied=await control();
  assert.equal(denied.status,200);
  const denyBody=await denied.json();
  assert.equal(denyBody.permitted,false);
  assert.equal(denyBody.code,'OWNER_HALT_ACTIVE');
  assert.equal((await call('resume',{method:'POST',body:{computer_id:'pc-running'}})).status,200);
  assert.equal((await control().then(r=>r.json())).permitted,false);
  const staleResult=await call('result',{method:'POST',auth:deviceAuth,device:'pc-running',
   body:{command_id,ok:true,result:{outputs:[{action:'cursor.move'}]}}});
  assert.equal(staleResult.status,409);
  const row=await DB.prepare('SELECT status,error_code FROM computer_commands WHERE id=?').bind(command_id).first();
  assert.equal(row.status,'FAILED');
  assert.equal(row.error_code,'OWNER_HALT_ACTIVE');
 }finally{DB.close();}
});

test('both packaged Windows engines recheck remote cancellation at step boundaries',async()=>{
 const paths=['../assets/MEL-Computer-Companion.ps1','../dist/MEL-Computer-Companion.ps1'];
 const contents=await Promise.all(paths.map(path=>readFile(new URL(path,import.meta.url),'utf8')));
 assert.equal(contents[0],contents[1]);
 for(const code of contents){
  const helper=code.slice(code.indexOf('function Assert-ActiveRemoteCommand('),
   code.indexOf('function Assert-LocalRemoteAccess {'));
  assert.match(helper,/control-state\?command_id/);
  assert.match(helper,/TimeoutSec 5/);
  assert.match(helper,/COMPUTER_CONTROL_CHECK_UNAVAILABLE/);
  const block=code.slice(code.indexOf('function Process-Command($command) {'),code.indexOf('$trayResources = $null'));
  assert.match(block,/if \(\$isRemoteGui\) \{ Assert-ActiveRemoteCommand/);
  assert.match(block,/Assert-ActiveRemoteCommand \(\[string\]\$command.id\)/);
  }
});

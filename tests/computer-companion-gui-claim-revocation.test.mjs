import test from 'node:test';
import assert from 'node:assert/strict';
import {maybeHandleComputerApi} from '../src/devices/computer-companion-api.js';
import {sqliteD1} from './helpers/sqlite-d1.mjs';

test('queued GUI command is revoked before claim after local Companion access is disabled',async()=>{
 const DB=sqliteD1();
 try{
  const env={DB,MELITURGOS_USER:'owner',MELITURGOS_PASSWORD:'secret'};
  const owner='Basic '+Buffer.from('owner:secret').toString('base64');
  const url='https://mel.test/api/computer/v1/';
  const call=(path,{method='GET',auth=owner,device=false,body}={})=>
   maybeHandleComputerApi(new Request(url+path,{
    method,
    headers:{authorization:auth,...(device?{'x-mel-computer-id':'gui-revoke-pc'}:{}),
     ...(body?{'content-type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
   }),env);

  const codeResponse=await call('pair-code',{method:'POST',body:{}});
  assert.equal(codeResponse.status,200);
  const {code}=await codeResponse.json();
  const paired=await call('pair',{method:'POST',auth:'',body:{pair_code:code,
   computer_id:'gui-revoke-pc',platform:'windows'}});
  assert.equal(paired.status,200);
  const {token}=await paired.json();
  const bearer='Bearer '+token;
  const heartbeat=enabled=>call('heartbeat',{method:'POST',auth:bearer,device:true,
   body:{remote_access_enabled:enabled,engine_version:'1.4.1',engine_heartbeat_at:Date.now()}});
  const enqueue=()=>call('commands',{method:'POST',body:{
   computer_id:'gui-revoke-pc',steps:[{id:'move-1',action:'cursor.move',x:100,y:150}]
  }});
  const claim=()=>call('commands',{auth:bearer,device:true});

  assert.equal((await heartbeat(true)).status,200);
  const queued=await enqueue();
  assert.equal(queued.status,202);
  const {command_id:firstId}=await queued.json();

  assert.equal((await heartbeat(false)).status,200);
  const rejected=await claim();
  assert.equal(rejected.status,200);
  const denied=await rejected.json();
  assert.equal(denied.command,null);
  assert.deepEqual(denied.blocked_command,{id:firstId,code:'REMOTE_ACCESS_DISABLED_LOCALLY'});
  const row=await DB.prepare('SELECT status,error_code FROM computer_commands WHERE id=?')
   .bind(firstId).first();
  assert.equal(row.status,'FAILED');
  assert.equal(row.error_code,'REMOTE_ACCESS_DISABLED_LOCALLY');

  assert.equal((await heartbeat(true)).status,200);
  assert.equal((await claim().then(r=>r.json())).command,null,
   'permission restored must not resurrect previously denied work');

  const fresh=await enqueue();
  assert.equal(fresh.status,202);
  const {command_id:secondId}=await fresh.json();
  const allowed=await claim();
  assert.equal(allowed.status,200);
  const accepted=await allowed.json();
  assert.equal(accepted.command?.id,secondId);
  assert.equal(accepted.command.plan.schema,'mel.devices.computer-use.v1');
 }finally{DB.close();}
});

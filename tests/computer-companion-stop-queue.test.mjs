import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {maybeHandleComputerApi} from '../src/devices/computer-companion-api.js';
import {sqliteD1} from './helpers/sqlite-d1.mjs';

test('STOP cancels queued work permanently, without affecting other devices',async()=>{
 const DB=sqliteD1();
 try{
  const env={DB,MELITURGOS_USER:'owner',MELITURGOS_PASSWORD:'secret'};
  const owner='Basic '+Buffer.from('owner:secret').toString('base64');
  const request=(path,{auth=owner,device,method='GET',body}={})=>
   maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/'+path,{
    method,headers:{authorization:auth,...(device?{'x-mel-computer-id':device}:{}),
     ...(body!==undefined?{'content-type':'application/json'}:{})},
    ...(body!==undefined?{body:JSON.stringify(body)}:{})
   }),env);
  const pair=async id=>{
   const r=await request('pair-code',{method:'POST',body:{}});
   assert.equal(r.status,200);
   const {code}=await r.json();
   const p=await request('pair',{method:'POST',auth:'',body:{pair_code:code,computer_id:id,platform:'windows'}});
   assert.equal(p.status,200);
   return (await p.json()).token;
  };
  const t1=await pair('stop-pc'),t2=await pair('other-pc');
  for(const [id,token] of [['stop-pc',t1],['other-pc',t2]]){
   const hb=await request('heartbeat',{method:'POST',auth:'Bearer '+token,device:id,body:{remote_access_enabled:true}});
   assert.equal(hb.status,200);
  }
  const enqueue=async id=>{
   const res=await request('commands',{method:'POST',body:{computer_id:id,
    steps:[{id:'s',action:'cursor.move',x:10,y:10}]}});
   assert.equal(res.status,202);
   return (await res.json()).command_id;
  };
  const a=await enqueue('stop-pc'),b=await enqueue('stop-pc'),other=await enqueue('other-pc');
  const halt=await request('halt',{method:'POST',body:{computer_id:'stop-pc'}});
  assert.equal(halt.status,200);
  const h=await halt.json();
  assert.equal(h.computer.halted,true);
  assert.equal(h.cancelled_pending,2);
  for(const id of [a,b]){
   const row=await DB.prepare('SELECT status,error_code FROM computer_commands WHERE id=?').bind(id).first();
   assert.equal(row.status,'FAILED');
   assert.equal(row.error_code,'OWNER_HALT_ACTIVE');
  }
  const stopped=await request('commands',{auth:'Bearer '+t1,device:'stop-pc'});
  assert.equal((await stopped.json()).halted,true);
  assert.equal((await request('resume',{method:'POST',body:{computer_id:'stop-pc'}})).status,200);
  const empty=await request('commands',{auth:'Bearer '+t1,device:'stop-pc'});
  assert.equal((await empty.json()).command,null);
  const unaffected=await request('commands',{auth:'Bearer '+t2,device:'other-pc'});
  assert.equal((await unaffected.json()).command.id,other);
  const fresh=await enqueue('stop-pc');
  const next=await request('commands',{auth:'Bearer '+t1,device:'stop-pc'});
  assert.equal((await next.json()).command.id,fresh);
 }finally{DB.close();}
});
test('claim SQL rechecks owner HALT atomically',async()=>{
 const src=await readFile(new URL('../src/devices/computer-companion-api.js',import.meta.url),'utf8');
 const claim=src.slice(src.indexOf('async function claim('),src.indexOf('async function result('));
 assert.match(claim,/EXISTS \(SELECT 1 FROM computer_devices WHERE id=\? AND halted=0\)/);
});

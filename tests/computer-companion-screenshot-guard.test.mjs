import test from 'node:test';
import assert from 'node:assert/strict';
import {maybeHandleComputerApi} from '../src/devices/computer-companion-api.js';
import {sqliteD1} from './helpers/sqlite-d1.mjs';

test('screenshots require matching RUNNING command and valid PNG signature',async()=>{
 const DB=sqliteD1();const saved=[];
 try{
  const env={DB,MELITURGOS_USER:'owner',MELITURGOS_PASSWORD:'secret',MEDIA_BUCKET:{async put(key,bytes){saved.push({key,bytes})}}};
  const basic='Basic '+Buffer.from('owner:secret').toString('base64');
  const codeRes=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/pair-code',{method:'POST',headers:{authorization:basic,'content-type':'application/json'},body:'{}'}),env);
  const {code}=await codeRes.json();
  const pairRes=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/pair',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pair_code:code,computer_id:'screenshot-pc',platform:'windows'})}),env);
  assert.equal(pairRes.status,200);
  const {token}=await pairRes.json();
  const headers={authorization:'Bearer '+token,'x-mel-computer-id':'screenshot-pc','content-type':'image/png'};
  const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  const post=(id,body=png)=>maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/screenshot'+(id?'?command_id='+id:''),{method:'POST',headers,body}),env);
  assert.equal((await post('')).status,400);
  assert.equal((await post('unknown')).status,409);
  await DB.prepare('INSERT INTO computer_commands(id,device_id,session_id,plan_json,status,created_at) VALUES(?,?,?,?,?,?)').bind('foreign','other-pc','s','{}','RUNNING',Date.now()).run();
  assert.equal((await post('foreign')).status,409);
  await DB.prepare('INSERT INTO computer_commands(id,device_id,session_id,plan_json,status,created_at) VALUES(?,?,?,?,?,?)').bind('pending','screenshot-pc','s','{}','PENDING',Date.now()).run();
  assert.equal((await post('pending')).status,409);
  await DB.prepare("UPDATE computer_commands SET status='RUNNING' WHERE id='pending'").run();
  assert.equal((await post('pending',Uint8Array.from([1,2,3]))).status,415);
  const accepted=await post('pending');
  assert.equal(accepted.status,200);
  assert.match((await accepted.json()).key,/screenshot-pc\/pending\.png$/);
  assert.equal(saved.length,1);
 }finally{DB.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {maybeHandleComputerApi} from '../src/devices/computer-companion-api.js';
import {sqliteD1} from './helpers/sqlite-d1.mjs';

test('desktop view may report SUCCESS only after matching screenshot object exists in R2',async()=>{
 const DB=sqliteD1();
 const images=new Map();
 const checked=[];
 try{
  const env={DB,MELITURGOS_USER:'owner',MELITURGOS_PASSWORD:'secret',
   MEDIA_BUCKET:{async head(key){checked.push(key);return images.get(key)??null}}};
  const owner='Basic '+Buffer.from('owner:secret').toString('base64');
  const pairCode=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/pair-code',{
   method:'POST',headers:{authorization:owner,'content-type':'application/json'},body:'{}'
  }),env);
  assert.equal(pairCode.status,200);
  const {code}=await pairCode.json();
  const pair=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/pair',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({pair_code:code,computer_id:'proof-pc',platform:'windows'})
  }),env);
  assert.equal(pair.status,200);
  const {token}=await pair.json();
  const headers={authorization:'Bearer '+token,'x-mel-computer-id':'proof-pc','content-type':'application/json'};
  const report=payload=>maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/result',{
   method:'POST',headers,body:JSON.stringify(payload)
  }),env);
  const plan={schema:'mel.companion.desktop-view-request/v1',action:'desktop.view.request',
   screen_capture_only:true,requires_local_stop:true,device_id:'proof-pc',
   session_id:'proof-session',expires_at:Date.now()+120000};
  await DB.prepare('INSERT INTO computer_commands(id,device_id,session_id,plan_json,status,created_at) VALUES(?,?,?,?,?,?)')
   .bind('proof-cmd','proof-pc','proof-session',JSON.stringify(plan),'RUNNING',Date.now()).run();
  const key='computer/screenshots/proof-pc/proof-cmd.png';
  const view_url='https://mel.test/api/computer/v1/screenshot?key='+encodeURIComponent(key);
  const success=output=>({command_id:'proof-cmd',ok:true,result:{
   capture_count:1,outputs:[{action:'desktop.view.request',screenshot_key:key,view_url,...output}]
  }});
  let response=await report({command_id:'proof-cmd',ok:true,result:{outputs:[],capture_count:1}});
  assert.equal(response.status,409);
  assert.equal((await response.json()).code,'SCREENSHOT_RESULT_PROOF_INVALID');
  assert.equal(checked.length,0);

  response=await report(success());
  assert.equal(response.status,409);
  assert.equal((await response.json()).code,'SCREENSHOT_RESULT_IMAGE_MISSING');
  assert.deepEqual(checked,[key]);
  let row=await DB.prepare('SELECT status FROM computer_commands WHERE id=?').bind('proof-cmd').first();
  assert.equal(row.status,'RUNNING');

  images.set(key,{size:512});
  response=await report(success({view_url:'https://untrusted.test/malicious'}));
  assert.equal(response.status,409);
  assert.equal((await response.json()).code,'SCREENSHOT_RESULT_PROOF_INVALID');

  response=await report(success({screenshot_key:'computer/screenshots/other-pc/other.png'}));
  assert.equal(response.status,409);
  assert.equal((await response.json()).code,'SCREENSHOT_RESULT_PROOF_INVALID');

  response=await report(success());
  assert.equal(response.status,200);
  assert.equal((await response.json()).ok,true);
  row=await DB.prepare('SELECT status,result_json FROM computer_commands WHERE id=?').bind('proof-cmd').first();
  assert.equal(row.status,'SUCCEEDED');
  assert.equal(JSON.parse(row.result_json).outputs[0].screenshot_key,key);

  assert.equal((await report(success())).status,409);
 }finally{DB.close();}
});

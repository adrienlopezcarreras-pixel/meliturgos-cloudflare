import test from 'node:test';
import assert from 'node:assert/strict';
import {maybeHandleComputerApi} from '../src/devices/computer-companion-api.js';
import {sqliteD1} from './helpers/sqlite-d1.mjs';

test('Companion result endpoint accepts only one RUNNING result for the authenticated device',async()=>{
 const DB=sqliteD1();
 try{
  const env={DB,MELITURGOS_USER:'owner',MELITURGOS_PASSWORD:'secret'};
  const owner='Basic '+Buffer.from('owner:secret').toString('base64');
  const codeResponse=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/pair-code',{method:'POST',headers:{authorization:owner,'content-type':'application/json'},body:'{}'}),env);
  assert.equal(codeResponse.status,200);
  const {code}=await codeResponse.json();
  const pairing=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/pair',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pair_code:code,computer_id:'result-guard-pc',platform:'windows'})}),env);
  assert.equal(pairing.status,200);
  const {token}=await pairing.json();
  const headers={authorization:'Bearer '+token,'x-mel-computer-id':'result-guard-pc','content-type':'application/json'};
  const report=body=>maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/result',{method:'POST',headers,body:JSON.stringify(body)}),env);
  const noId=await report({ok:true});
  assert.equal(noId.status,400);
  assert.equal((await noId.json()).code,'COMPUTER_RESULT_ID_REQUIRED');
  const unknown=await report({command_id:'unknown',ok:true});
  assert.equal(unknown.status,409);
  assert.equal((await unknown.json()).code,'COMPUTER_RESULT_NOT_RUNNING');
  await DB.prepare('INSERT INTO computer_commands(id,device_id,session_id,plan_json,status,created_at) VALUES(?,?,?,?,?,?)').bind('result-command','result-guard-pc','session-1','{}','PENDING',Date.now()).run();
  assert.equal((await report({command_id:'result-command',ok:true})).status,409);
  await DB.prepare("UPDATE computer_commands SET status='RUNNING' WHERE id=?").bind('result-command').run();
  const accepted=await report({command_id:'result-command',ok:true,result:{summary:'done'}});
  assert.equal(accepted.status,200);
  assert.equal((await accepted.json()).ok,true);
  const row=await DB.prepare('SELECT status,result_json FROM computer_commands WHERE id=?').bind('result-command').first();
  assert.equal(row.status,'SUCCEEDED');
  assert.equal(JSON.parse(row.result_json).summary,'done');
  assert.equal((await report({command_id:'result-command',ok:false})).status,409);
  const after=await DB.prepare('SELECT status FROM computer_commands WHERE id=?').bind('result-command').first();
  assert.equal(after.status,'SUCCEEDED');
 }finally{DB.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {evaluateOptionalAiResultDeadline as decide} from '../../src/devices/companion-compute-admission.js';
const now=1700000000000;
const plan=(deadline)=>({schema:'mel.sovereignty.local-command/v1',steps:[{action:'sovereignty.ai.invoke',payload:{owner_inference_deadline_ms:deadline}}]});
test('completed timely local inference may be accepted',()=>{
 assert.deepEqual(decide({plan:plan(now+5000),now}),{ok:true,reason:'LOCAL_AI_RESULT_ON_TIME'});
 assert.equal(decide({plan:{schema:'other',steps:[{action:'clipboard.write'}]},now}).ok,true);
});
test('expired, missing and malformed result evidence never claims success',()=>{
 for(const candidate of [
  plan(now-1),plan(now),plan(undefined),plan(now+120001),
  {...plan(now+5000),schema:'wrong'},
  {...plan(now+5000),steps:[...plan(now+5000).steps,{action:'clipboard.read'}]}
 ]) assert.equal(decide({plan:candidate,now}).ok,false);
});
test('API persists FAILED on late success before normal SUCCEEDED mutation',async()=>{
 const s=await readFile(new URL('../../src/devices/computer-companion-api.js',import.meta.url),'utf8');
 const statuses=await readFile(new URL('../../src/devices/computer-command-status.js',import.meta.url),'utf8');
 assert.match(s,/import \{ COMPUTER_COMMAND_STATUS \} from "\.\/computer-command-status\.js"/);
 assert.match(statuses,/FAILED: "FAILED"/);
 const start=s.indexOf('async function result(request,env,a)');
 const verdict=s.indexOf('const aiResultVerdict=evaluateOptionalAiResultDeadline(',start);
 const save=s.indexOf('const update=await env.DB.prepare("UPDATE computer_commands SET status=?,finished_at=?,result_json=?,error_code=?',start);
 assert.ok(start>=0&&verdict>start&&save>verdict);
 const safeguard=s.slice(verdict,save);
 assert.match(safeguard,/\.bind\(COMPUTER_COMMAND_STATUS\.FAILED,Date.now\(\),aiResultVerdict.code,id,a.device.id,"RUNNING"\)/);
 assert.match(safeguard,/return json\(\{ok:false,code:aiResultVerdict.code\},409\)/);
});

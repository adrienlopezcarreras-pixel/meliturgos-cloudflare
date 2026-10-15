import test from 'node:test';
import assert from 'node:assert/strict';
import {maybeHandleComputerApi} from '../../src/devices/computer-companion-api.js';

function fixture({deadline=Date.now()+5000,status='RUNNING',action='sovereignty.ai.invoke'}={}){
 const updates=[];
 const plan={schema:'mel.sovereignty.local-command/v1',
   steps:[{action,payload:deadline===null?{}:{owner_inference_deadline_ms:deadline}}]};
 const device={id:'owner-pc',token_hash:'ignored-by-mock',name:'Owner Windows',platform:'windows',
   capabilities:'[]',allowed_apps:'[]',metadata:'{}',halted:0,created_at:Date.now()-1000,last_seen_at:Date.now()};
 const DB={
   prepare(sql){
     return{
       async run(){return{meta:{changes:0}};}, // create-table setup
       bind(...args){
         return{
           async first(){
             if(sql.includes('FROM computer_devices'))return device;
             if(sql.includes('FROM computer_commands'))return {status,plan_json:JSON.stringify(plan)};
             return null;
           },
           async run(){
             updates.push({sql,args});
             return{success:true,meta:{changes:sql.startsWith('UPDATE computer_commands')?1:0}};
           }
         };
       }
     };
   }
 };
 return{env:{DB},updates};
}
async function postResult(env,{ok=true}={}){
 const req=new Request('https://mel.example/api/computer/v1/result',{
   method:'POST',
   headers:{'authorization':'Bearer owner-token','x-mel-computer-id':'owner-pc','content-type':'application/json'},
   body:JSON.stringify({command_id:'cmd-test',ok,result:{outputs:[{action:'sovereignty.ai.invoke',text:'Ollama generated answer'}]}})
 });
 return maybeHandleComputerApi(req,env);
}
test('REAL result HTTP route refuses successful Ollama result already expired',async()=>{
 const {env,updates}=fixture({deadline:Date.now()-3000});
 const res=await postResult(env);
 assert.equal(res.status,409);
 assert.equal((await res.json()).code,'LOCAL_AI_RESULT_EXPIRED');
 assert.equal(updates.length,1);
 assert.equal(updates[0].args[0],'FAILED');
 assert.equal(updates[0].args[2],'LOCAL_AI_RESULT_EXPIRED');
 assert.ok(updates[0].sql.includes('status=?'));
});
test('REAL route accepts timely Ollama result and persists SUCCEEDED',async()=>{
 const {env,updates}=fixture({deadline:Date.now()+40000});
 const res=await postResult(env);
 assert.equal(res.status,200);
 assert.equal((await res.json()).ok,true);
 assert.equal(updates.length,1);
 assert.equal(updates[0].args[0],'SUCCEEDED');
});
test('REAL route refuses missing deadline and does not change unrelated commands',async()=>{
 const missing=fixture({deadline:null});
 assert.equal((await postResult(missing.env)).status,409);
 assert.equal(missing.updates[0].args[0],'FAILED');
 const unrelated=fixture({action:'clipboard.read',deadline:null});
 assert.equal((await postResult(unrelated.env)).status,200);
 assert.equal(unrelated.updates[0].args[0],'SUCCEEDED');
});
test('already-failed or never-claimed commands cannot be resurrected',async()=>{
 const {env,updates}=fixture({status:'FAILED',deadline:Date.now()+50000});
 const res=await postResult(env);
 assert.equal(res.status,409);
 assert.equal(updates.length,0);
});
test('post-deadline failure is recorded as FAILED, never as a success',async()=>{
 const {env,updates}=fixture({deadline:Date.now()-5000});
 const res=await postResult(env,{ok:false});
 assert.equal(res.status,200);
 assert.equal(updates[0].args[0],'FAILED');
});

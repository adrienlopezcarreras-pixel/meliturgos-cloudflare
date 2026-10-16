import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWLIST,validateSelectedRecords,validateExecution,proveSafeExecutions,
} from '../scripts/prove-production-safe-capabilities-readonly.mjs';

const SHA='a'.repeat(40);
const rows=Array.from({length:29},(_,i)=>({
  id:'placeholder.'+i,health:'HEALTHY',enabled:true,risk:'LOW',
}));
rows.push(...ALLOWLIST.map(a=>({id:a.id,health:'HEALTHY',enabled:true,risk:'LOW'})));
test('safe execution allowlist contains only pure echo and list methods',()=>{
  assert.deepEqual(ALLOWLIST.map(x=>x.id),['echo','project.list','skill.list','timeline.list']);
  assert.ok(ALLOWLIST.every(x=>x.id==='echo'||x.id.endsWith('.list')));
  assert.ok(ALLOWLIST.every(x=>!Object.keys(x.input).some(k=>/write|create|delete|deploy|approve|activate/.test(k))));
});
test('unavailable or non-low-risk capability blocks execution before POST',()=>{
  assert.equal(validateSelectedRecords(rows).ok,true);
  assert.equal(validateSelectedRecords(rows.filter(x=>x.id!=='project.list')).ok,false);
  assert.equal(validateSelectedRecords(rows.map(x=>x.id==='echo'?{...x,risk:'HIGH'}:x)).ok,false);
});
test('echo must return exact expected value; lists must be real arrays',()=>{
  assert.equal(validateExecution({ok:true,capability:'echo',result:{value:ALLOWLIST[0].input.value}},ALLOWLIST[0]).ok,true);
  assert.equal(validateExecution({ok:true,capability:'echo',result:{value:'faked'}},ALLOWLIST[0]).ok,false);
  assert.equal(validateExecution({ok:true,capability:'project.list',result:{}},ALLOWLIST[1]).ok,false);
  assert.equal(validateExecution({ok:true,capability:'project.list',result:[]},ALLOWLIST[1]).ok,true);
});
test('end-to-end offline fixture calls GET then only allowlisted POST without logging data',async()=>{
  const calls=[];
  const f=async(url,opts)=>{
    const endpoint=new URL(url).pathname;
    calls.push({endpoint,method:opts.method,body:opts.body});
    if(endpoint.endsWith('/self-check'))
      return Response.json({ok:true,deployed_sha:SHA,exact_deployment_identity_known:true});
    if(endpoint==='/api/gen2/capabilities')
      return Response.json({ok:true,health_refreshed:false,capabilities:rows});
    const payload=JSON.parse(opts.body);
    const result=payload.id==='echo'?{value:payload.input.value}:[{secret:'never-returned-to-log'}];
    return Response.json({ok:true,capability:payload.id,result});
  };
  const r=await proveSafeExecutions({token:'fixture',expectedSha:SHA,fetchImpl:f});
  assert.equal(r.ok,true,r.code);
  assert.equal(r.executed_count,4);
  assert.equal(r.private_content_logged,false);
  assert.equal(JSON.stringify(r).includes('never-returned-to-log'),false);
  assert.deepEqual(calls.map(x=>x.method),['GET','GET','GET','POST','POST','POST','POST']);
  assert.ok(calls.filter(x=>x.method==='POST').every(x=>ALLOWLIST.some(a=>a.id===JSON.parse(x.body).id)));
});
test('misleading wrong SHA fails before capability execution',async()=>{
  let calls=0;
  const r=await proveSafeExecutions({token:'fixture',expectedSha:SHA,fetchImpl:async(url)=>{
    calls++;return Response.json(url.endsWith('/self-check')
      ?{ok:true,deployed_sha:'b'.repeat(40),exact_deployment_identity_known:true}
      :{ok:true,capabilities:rows,health_refreshed:false});
  }});
  assert.equal(r.ok,false);
  assert.equal(calls,2);
});

test('live capability proof refuses altered or incomplete allowlists before network use', async()=>{
  const cases=[[],ALLOWLIST.slice(0,3),[...ALLOWLIST].reverse(),
    ALLOWLIST.map((x,i)=>i===0?{...x,input:{value:'altered'}}:x),
    ALLOWLIST.map((x,i)=>i===1?{...x,input:{unexpected:true}}:x)];
  for(const allowlist of cases){
    let calls=0;
    const r=await proveSafeExecutions({token:'fixture',expectedSha:SHA,allowlist,
      fetchImpl:async()=>{calls++;throw Error('network must not be reached');}});
    assert.equal(r.ok,false);
    assert.equal(r.code,'LIVE_SAFE_EXECUTION_PROBE_INPUT_INVALID');
    assert.equal(calls,0);
  }
});

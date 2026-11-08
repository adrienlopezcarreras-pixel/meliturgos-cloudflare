import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { onRequestGet } from '../src/pages/full-interface-v2.js';
import entry from '../src/professor-live-learning-entry.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

async function browser(fetch){
  const html=await (await onRequestGet()).text();
  const start=html.indexOf('function requestTimeoutMs('),end=html.indexOf('async function loadCapabilitiesData',start);
  assert.ok(start>0&&end>start);
  let receipt=null;
  const timers=[];
  const context=vm.createContext({fetch,crypto:webcrypto,TextEncoder,AbortController,Map,console,
    setTimeout:(fn,ms)=>{if(ms===1500){timers.push(fn);return 0;}return setTimeout(fn,ms);},clearTimeout,
    document:{getElementById:()=>receipt,querySelector:()=>({prepend:node=>{receipt=node;}}),createElement:()=>({setAttribute(){}})}});
  vm.runInContext('const getInflight=new Map();\n'+html.slice(start,end),context);
  return {send:(url,body='{}')=>context.jfetch(url,{method:'POST',body}),text:()=>receipt?.textContent,expire:()=>timers.splice(0).forEach(fn=>fn())};
}
for(const url of ['/api/work/jobs','/api/gen2/shardvault/snapshot','/api/gen2/migration/chatgpt-memory-backfill','/api/gen2/augmentio/fanout','/api/learning/lora/train','/api/gen2/connections/google/save']){
  test('emitted UI shares the real acknowledgement on double click: '+url,async()=>{
    let release,started,calls=0;
    const reached=new Promise(resolve=>{started=resolve;});
    const gate=new Promise(resolve=>{release=resolve;});
    const ui=await browser(async()=>{calls++;started();await gate;return Response.json({ok:true,id:'real-reference',status:'PREPARED',client_secret:'never-display'});});
    const first=ui.send(url),second=ui.send(url);
    await reached;assert.equal(calls,1);
    release();assert.equal((await first).id,'real-reference');await second;
    await ui.send(url);assert.equal(calls,1);assert.match(ui.text(),/HTTP 200.*real-reference/);assert.doesNotMatch(ui.text(),/never-display/);
    ui.expire();await ui.send(url);assert.equal(calls,2);
  });
}
for(const [status,code] of [[403,'PERMISSION_DENIED'],[503,'SERVICE_UNAVAILABLE']]){
  // Verify that GET actions also display refusal correctly.
  test('emitted UI displays the actual refusal without invented reference: '+status,async()=>{
    const ui=await browser(async()=>Response.json({ok:false,code},{status}));
    await assert.rejects(ui.send('/api/learning/lora/train'),new RegExp(code));
    assert.match(ui.text(),new RegExp('HTTP '+status+'.*'+code));assert.match(ui.text(),/référence non fournie/);
  });
}
test('an unacknowledged mutation remains ambiguous and is not immediately sent twice',async()=>{
  let calls=0;const ui=await browser(async()=>{calls++;throw Error('connection lost');});
  await assert.rejects(ui.send('/api/work/jobs'),/connection lost/);
  await assert.rejects(ui.send('/api/work/jobs'),/connection lost/);
  assert.equal(calls,1);assert.match(ui.text(),/Réponse non confirmée/);
});
test('different user intents are not collapsed',async()=>{
  let calls=0;const ui=await browser(async()=>Response.json({id:++calls}));
  await ui.send('/api/work/jobs','{"goal":"first"}');await ui.send('/api/work/jobs','{"goal":"second"}');assert.equal(calls,2);
});

const request=(track='qwen3')=>new Request('https://mel.example/api/learning/lora/experimental/train',{method:'POST',headers:{Authorization:'Bearer fixture-password','content-type':'application/json'},body:JSON.stringify({track,mode:'preflight'})});
test('experimental launches serialize in real D1 while GitHub indexing lags',async t=>{
  const DB=sqliteD1({maintenanceFence:true});t.after(()=>DB.close());
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  let release,started,posts=0;
  const gate=new Promise(resolve=>{release=resolve;}),reached=new Promise(resolve=>{started=resolve;});
  globalThis.fetch=async(_url,opts)=>{if(opts.method==='POST'){posts++;return new Response(null,{status:204});}started();await gate;return Response.json({workflow_runs:[]});};
  const env={DB,MELITURGOS_PASSWORD:'fixture-password',MEL_GITHUB_TOKEN:'fixture'};
  const first=entry.fetch(request(),env,{});await reached;
  const second=await entry.fetch(request(),env,{});assert.equal(second.status,202);assert.equal((await second.json()).dispatched,false);
  release();assert.equal((await (await first).json()).status,'PREFLIGHT_DISPATCH_ACCEPTED');
  assert.equal((await entry.fetch(request(),env,{})).status,202);assert.equal(posts,1);
  assert.equal((await (await entry.fetch(request('abliteration'),env,{})).json()).dispatched,true);assert.equal(posts,2);
});
test('lost GitHub dispatch acknowledgement retains the lease',async t=>{
  const DB=sqliteD1({maintenanceFence:true});t.after(()=>DB.close());
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let posts=0;
  globalThis.fetch=async(_url,opts)=>{if(opts.method==='POST'){posts++;throw Error('lost acknowledgement');}return Response.json({workflow_runs:[]});};
  const env={DB,MELITURGOS_PASSWORD:'fixture-password',MEL_GITHUB_TOKEN:'fixture'};
  assert.equal((await entry.fetch(request(),env,{})).status,503);
  assert.equal((await entry.fetch(request(),env,{})).status,202);assert.equal(posts,1);
});
test('missing authentication or atomic storage fails closed without dispatch',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let calls=0;
  globalThis.fetch=async()=>{calls++;throw Error('must not dispatch');};
  const env={MELITURGOS_PASSWORD:'fixture-password',MEL_GITHUB_TOKEN:'fixture'};
  assert.equal((await entry.fetch(new Request('https://mel.example/api/learning/lora/experimental/train',{method:'POST'}),env,{})).status,401);
  const unavailable=await entry.fetch(request(),env,{});assert.equal(unavailable.status,503);assert.equal((await unavailable.json()).error,'TRAINING_LAUNCH_GUARD_UNAVAILABLE');assert.equal(calls,0);
});

test('real WORK button clears only an acknowledged unchanged goal and cannot create a second job',async()=>{
  const source=await readFile(new URL('../src/pages/full-interface-v2.js',import.meta.url),'utf8');
  const start=source.indexOf("qs('#workCreate').onclick="),end=source.indexOf('function setLoraTag',start);
  const nodes=new Map(),qs=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false});return nodes.get(id);};
  qs('#workGoal').value='Deliver the requested report';
  let calls=0;
  const ui=await browser(async()=>{calls++;return Response.json({ok:true,id:'actual-work-job',status:'PREPARED'});});
  new Function('qs','jfetch','selectedWorkComputer','workComputerLastView','workComputerInterpretation',source.slice(start,end))(qs,(url,opts)=>ui.send(url,opts.body),()=>null,null,null);
  await Promise.all([qs('#workCreate').onclick(),qs('#workCreate').onclick()]);
  assert.equal(calls,1);assert.equal(qs('#workGoal').value,'');
  ui.expire();await qs('#workCreate').onclick();assert.equal(calls,1);
  assert.match(qs('#workOut').textContent,/actual-work-job/);
});
test('real LoRA button double click shares the launch acknowledgement',async()=>{
  const source=await readFile(new URL('../src/pages/full-interface-v2.js',import.meta.url),'utf8');
  const start=source.indexOf("qs('#freeLoraTrain').onclick="),end=source.indexOf("qs('#freeLoraRefresh').onclick=",start);
  const nodes=new Map(),qs=id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);};
  let calls=0;
  const ui=await browser(async()=>{calls++;return Response.json({ok:true,dispatched:true,status:'DISPATCH_ACCEPTED'});});
  new Function('qs','jfetch','panelLoadedAt','loadFreeLoraStatus',source.slice(start,end))(qs,(url,opts)=>ui.send(url,opts.body),new Map(),async()=>{});
  await Promise.all([qs('#freeLoraTrain').onclick(),qs('#freeLoraTrain').onclick()]);
  assert.equal(calls,1);assert.match(qs('#freeLoraTrainResult').textContent,/Entraînement demandé/);assert.match(ui.text(),/DISPATCH_ACCEPTED/);
});
test('GitHub redirects fail closed and a pre-dispatch failure releases the launch guard',async t=>{
  const DB=sqliteD1({maintenanceFence:true});t.after(()=>DB.close());
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let calls=0;
  globalThis.fetch=async(url,opts)=>{
    calls++;assert.match(String(url),/^https:\/\/api\.github\.com\/repos\/adrienlopezcarreras-pixel\/meliturgos-cloudflare\//);
    assert.equal(opts.redirect,'manual');assert.ok(opts.signal instanceof AbortSignal);
    return new Response(null,{status:302,headers:{location:'https://foreign.example/never-follow'}});
  };
  const env={DB,MELITURGOS_PASSWORD:'fixture-password',MEL_GITHUB_TOKEN:'fixture'};
  for(let n=0;n<2;n++){
    const response=await entry.fetch(request(),env,{});assert.equal(response.status,502);assert.equal((await response.json()).error,'GITHUB_TRAINING_API_FAILED');
  }
  assert.equal(calls,2);
  assert.equal(await DB.prepare('SELECT count(*) AS n FROM work_dag_run_leases').first('n'),0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyRepairRelease, REPAIR_RELEASE_GATES} from '../src/evolution/verified-repair-release.js';

const REPOSITORY='adrienlopezcarreras-pixel/meliturgos-cloudflare';
const SHA='a'.repeat(40);
const RUN_ID=99;
const TOKEN='github-read-token-must-stay-private';
const ROOT=`https://api.github.com/repos/${REPOSITORY}/actions/runs/${RUN_ID}`;
function fixture() {
  return {
    oidc:{ok:true,identity:{ok:true,repository:REPOSITORY,sha:SHA,run_id:RUN_ID}},
    deployedSha:SHA,
    token:TOKEN,
    run:{id:RUN_ID,head_sha:SHA,repository:{full_name:REPOSITORY},path:'.github/workflows/deploy-cloudflare-release.yml',event:'workflow_dispatch'},
    jobs:{total_count:REPAIR_RELEASE_GATES.length+1,jobs:[
      ...REPAIR_RELEASE_GATES.map(name=>({name,status:'completed',conclusion:'success'})),
      {name:'resume-verified-repair',status:'in_progress',conclusion:null},
    ]},
  };
}

// Workers supports only manual/follow redirects. Node accepts error, so a
// generic fetch stub conceals a TypeError that occurs before the network call.
function workersFetch(calls, response) {
  return async (url,init)=>{
    if(init?.redirect==='error')throw new TypeError("Unsupported redirect mode 'error'. Only follow and manual are supported");
    assert.equal(init?.redirect,'manual','the verifier must observe redirects without following them');
    calls.push({url:String(url),authorization:new Headers(init.headers).get('authorization')});
    return response(String(url));
  };
}

test('Worker-compatible transport reads exact run and every job before accepting a repair release',async()=>{
  const f=fixture(),calls=[];
  const result=await verifyRepairRelease({...f,fetchImpl:workersFetch(calls,url=>Response.json(url===ROOT?f.run:f.jobs))});
  assert.equal(result.ok,true);
  assert.equal(result.status,'REPAIR_RELEASE_HEALTH_VERIFIED');
  assert.deepEqual(calls.map(row=>row.url),[ROOT,ROOT+'/jobs?per_page=100']);
  assert.ok(calls.every(row=>row.authorization===`Bearer ${TOKEN}`));
  assert.ok(!JSON.stringify(result).includes(TOKEN));
});

for(const stage of ['RUN','JOBS'])for(const status of [301,302,303,307,308]) {
  test(`${stage} HTTP ${status} cannot redirect the GitHub token to another endpoint`,async()=>{
    const f=fixture(),calls=[];
    const location=`https://foreign.example/collect?private=${TOKEN}`;
    const result=await verifyRepairRelease({...f,fetchImpl:workersFetch(calls,url=>{
      if(stage==='JOBS'&&url===ROOT)return Response.json(f.run);
      return new Response(null,{status,headers:{location}});
    })});
    assert.equal(result.ok,false);
    assert.equal(result.reason,`${stage}_HTTP_${status}`);
    assert.equal(calls.length,stage==='RUN'?1:2);
    assert.ok(calls.every(row=>new URL(row.url).origin==='https://api.github.com'));
    assert.ok(!JSON.stringify(result).includes(TOKEN));
    assert.ok(!JSON.stringify(result).includes('foreign.example'));
  });
}

for(const stage of ['RUN','JOBS'])for(const kind of ['timeout','connection','unknown']) {
  test(`${stage} ${kind} exception fails closed without disclosing request credentials`,async()=>{
    const f=fixture(),calls=[];
    const result=await verifyRepairRelease({...f,fetchImpl:workersFetch(calls,url=>{
      if(stage==='JOBS'&&url===ROOT)return Response.json(f.run);
      if(kind==='timeout')throw new DOMException(`timeout details ${TOKEN}`,'TimeoutError');
      if(kind==='connection')throw new TypeError(`connection details https://private.example/${TOKEN}`);
      throw Object.assign(new Error(`unknown details ${TOKEN}`),{cause:{token:TOKEN}});
    })});
    assert.equal(result.ok,false);
    assert.equal(result.reason,`${stage}_FETCH_FAILED`);
    assert.equal(calls.length,stage==='RUN'?1:2);
    assert.ok(!JSON.stringify(result).includes(TOKEN));
    assert.ok(!JSON.stringify(result).includes('private.example'));
  });
}

test('actual Workers runtime executes the verifier without unsupported redirect options or external traffic',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {build}=await import('esbuild');
  const {fileURLToPath}=await import('node:url');
  const {Miniflare,convertV4MiniflareOptions}=await import('miniflare');
  const source=await readFile(new URL('../src/evolution/verified-repair-release.js',import.meta.url),'utf8');
  const f=fixture(),calls=[];
  const bundled=await build({stdin:{contents:source+'\nexport default {async fetch(){return Response.json(await verifyRepairRelease('+JSON.stringify({oidc:f.oidc,deployedSha:f.deployedSha,token:f.token})+'));}}',resolveDir:fileURLToPath(new URL('../src/evolution/',import.meta.url))},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
  const options={
    modules:true,
    compatibilityDate:'2026-09-04',
    cf:false,
    script:bundled.outputFiles[0].text,
    outboundService:async request=>{
      calls.push({url:request.url,authorization:request.headers.get('authorization')});
      assert.ok([ROOT,ROOT+'/jobs?per_page=100'].includes(request.url),'only the two fixed GitHub reads may leave the worker');
      return Response.json(request.url===ROOT?f.run:f.jobs);
    },
  };
  const runtime=new Miniflare(typeof convertV4MiniflareOptions==='function'?convertV4MiniflareOptions(options):options);
  try {
    const response=await runtime.dispatchFetch('http://localhost/verify');
    const result=await response.json();
    assert.equal(result.ok,true);
    assert.equal(result.status,'REPAIR_RELEASE_HEALTH_VERIFIED');
    assert.deepEqual(calls.map(row=>row.url),[ROOT,ROOT+'/jobs?per_page=100']);
    assert.ok(calls.every(row=>row.authorization===`Bearer ${TOKEN}`));
    assert.ok(!JSON.stringify(result).includes(TOKEN));
  }finally{await runtime.dispose();}
});

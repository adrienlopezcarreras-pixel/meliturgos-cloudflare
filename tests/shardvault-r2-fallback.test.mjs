import test from 'node:test';
import assert from 'node:assert/strict';
import { getShardVaultStatus, runShardVaultCycle } from '../src/continuity/shardvault-runtime.js';
import { handleShardVaultStatus } from '../src/pages/shardvault-status.js';

class FakeR2 {
  constructor(){this.map=new Map();}
  async put(key,value){
    const bytes=typeof value==='string'?new TextEncoder().encode(value):value instanceof Uint8Array?value:new Uint8Array(value);
    this.map.set(key,new Uint8Array(bytes));
    return {key};
  }
  async get(key){
    const bytes=this.map.get(key); if(!bytes)return null;
    return {
      async arrayBuffer(){return bytes.slice().buffer;},
      async text(){return new TextDecoder().decode(bytes);}
    };
  }
  async head(key){const bytes=this.map.get(key);return bytes?{key,size:bytes.length}:null;}
  async list({prefix='',cursor}={}){
    if(cursor)return {objects:[],truncated:false};
    return {objects:[...this.map.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false};
  }
}

test('ShardVault bootstraps on private R2 without external endpoint configuration', async () => {
  const env={
    MEL_SHARDVAULT_ENABLED:'true',
    MEL_SHARDVAULT_AUTONOMOUS:'false',
    MELITURGOS_PASSWORD:'test-password-that-is-long-enough-and-stable',
    MEL_VAULT_ID:'test-vault',
    MEL_DATA_SHARDS:'4',
    MEL_TOTAL_SHARDS:'7',
    MEDIA_BUCKET:new FakeR2(),
    DB:null,
  };
  const result=await runShardVaultCycle(env,{force:true});
  assert.equal(result.ok,true);
  assert.equal(result.skipped,false);
  assert.equal(result.storage_mode,'CLOUDFLARE_FALLBACK');
  assert.equal(result.shards,7);
  const status=await getShardVaultStatus(env);
  assert.equal(status.ok,true);
  assert.equal(status.status,'ONLINE');
  assert.equal(status.storage_mode,'CLOUDFLARE_FALLBACK');
  assert.equal(status.selected_endpoints[0].backend,'r2');
  assert.equal(status.health.healthy_shards,7);
});

test('preview ShardVault seed creates real local RS shards without external discovery, and cannot run in production', async () => {
  const base={
    MEL_SHARDVAULT_ENABLED:'true',MEL_SHARDVAULT_AUTONOMOUS:'true',
    MELITURGOS_PASSWORD:'test-preview-password-different-from-production',
    MEL_VAULT_ID:'preview-seed-test',MEL_DATA_SHARDS:'4',MEL_TOTAL_SHARDS:'7',
    MEL_RUNTIME_ENV:'preview',MEL_PREVIEW_ISOLATED:'true',
    MEDIA_BUCKET:new FakeR2(),DB:null,
  };
  const makeRequest=()=>new Request('https://preview.invalid/api/gen2/shardvault/snapshot',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({preview_bootstrap:true}),
  });
  const forbidden=await handleShardVaultStatus(makeRequest(),{...base,MEL_RUNTIME_ENV:'production'});
  assert.equal(forbidden.status,403);
  assert.equal((await forbidden.json()).status,'PREVIEW_ONLY');
  assert.equal(base.MEDIA_BUCKET.map.size,0);
  const response=await handleShardVaultStatus(makeRequest(),base);
  assert.equal(response.status,200);
  const first=await response.json();
  assert.equal(first.status,'PREVIEW_SEED_VERIFIED');
  assert.equal(first.verified_roundtrip,true);
  assert.equal(first.seed_only,true);
  assert.equal(first.shards,7);
  assert.equal(first.storage_mode,'CLOUDFLARE_FALLBACK');
  const second=await (await handleShardVaultStatus(makeRequest(),base)).json();
  assert.equal(second.status,'SIGNED_SNAPSHOT_EXISTS');
  assert.equal(second.snapshot_id,first.snapshot_id);
  assert.equal(second.verified_roundtrip,true);
});

test('critical bundle expectation is read-only and unavailable outside isolated preview', async () => {
  const path='https://preview.invalid/api/gen2/shardvault/code-source/expectation';
  const denied=await handleShardVaultStatus(new Request(path),{
    MEL_RUNTIME_ENV:'production',MEL_PREVIEW_ISOLATED:'false',
  });
  assert.equal(denied.status,403);
  assert.equal((await denied.json()).status,'PREVIEW_ONLY');
  const unavailable=await handleShardVaultStatus(new Request(path),{
    MEL_RUNTIME_ENV:'preview',MEL_PREVIEW_ISOLATED:'true',
  });
  assert.equal(unavailable.status,503);
  assert.equal((await unavailable.json()).status,'DEPLOYMENT_EXPECTATION_UNAVAILABLE');
});

test('preview exact-SHA and bundle-length gate precedes every Worker code-source upload', async () => {
  const fs=await import('node:fs');
  const source=fs.readFileSync(new URL('../.github/workflows/deploy-candidate-preview.yml',import.meta.url),'utf8');
  const gate=source.indexOf('      - name: Wait for exact-SHA critical bundle expectation on isolated preview');
  const upload=source.indexOf('      - name: Bind exact critical bundle through preview Worker');
  assert.ok(gate>=0&&upload>gate);
  assert.match(source,/PREVIEW_EXACT_SHA_AND_BUNDLE_SIZE_CONFIRMED/);
  assert.match(source,/PREVIEW_EXACT_SHA_BUNDLE_EXPECTATION_FAILED/);
  assert.match(source,/d\?\.declared_bytes/);
});

test('preview retries only declared Worker-size propagation races without loosening exact SHA/hash validation', async () => {
  const fs=await import('node:fs');
  const workflow=fs.readFileSync(new URL('../.github/workflows/deploy-candidate-preview.yml',import.meta.url),'utf8');
  const section=workflow.split('      - name: Bind exact critical bundle through preview Worker')[1]
    ?.split('      - name: ',1)[0]||'';
  assert.ok(section.includes('for attempt in {1..10}; do'));
  assert.ok(section.includes("status==='CRITICAL_BUNDLE_DECLARED_SIZE_MISMATCH'"));
  assert.ok(section.includes('process.exit(10)'));
  assert.ok(section.includes('PREVIEW_CRITICAL_BUNDLE_EDGE_PROPAGATION_RETRY'));
  assert.ok(section.includes('PREVIEW_EXACT_SHA_RECHECK_FAILED'));
  assert.ok(section.includes('CRITICAL_BUNDLE_RUNTIME_SHA_MISMATCH'));
  assert.ok(section.includes('CRITICAL_BUNDLE_RUNTIME_SIZE_MISMATCH'));
  assert.ok(section.includes('CRITICAL_BUNDLE_RUNTIME_HASH_INVALID'));
  assert.ok(section.includes('test "$copied" -eq 1'));
});


function previewEnv(bucket = new FakeR2()) {
  return {
    MEL_SHARDVAULT_ENABLED:'true',MEL_SHARDVAULT_AUTONOMOUS:'false',
    MELITURGOS_PASSWORD:'stable-preview-repair-key-not-production',
    MEL_VAULT_ID:'preview-repair-test',MEL_DATA_SHARDS:'4',MEL_TOTAL_SHARDS:'7',
    MEL_RUNTIME_ENV:'preview',MEL_PREVIEW_ISOLATED:'true',MEDIA_BUCKET:bucket,DB:null,
  };
}
function bootstrapRequest() {
  return new Request('https://preview.invalid/api/gen2/shardvault/snapshot',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({preview_bootstrap:true}),
  });
}
const manifestKey='shardvault/manifests/preview-repair-test/latest.json';
async function manifestOf(env) {
  return JSON.parse(await (await env.MEDIA_BUCKET.get(manifestKey)).text());
}

test('preview bootstrap repairs one missing fragment while preserving the signed snapshot and healthy objects',async()=>{
  const env=previewEnv();
  const first=await (await handleShardVaultStatus(bootstrapRequest(),env)).json();
  const before=await manifestOf(env),missing=before.shards[0];
  env.MEDIA_BUCKET.map.delete(missing.endpoint.keyPrefix+missing.objectId);
  const good=before.shards.slice(1).map(d=>[d.objectId,env.MEDIA_BUCKET.map.get(d.endpoint.keyPrefix+d.objectId).slice()]);
  const response=await handleShardVaultStatus(bootstrapRequest(),env);
  const result=await response.json();
  assert.equal(response.status,200);assert.equal(result.ok,true);
  assert.equal(result.snapshot_id,first.snapshot_id);assert.equal(result.verified_roundtrip,true);
  const after=await manifestOf(env);
  assert.equal(after.snapshotId,before.snapshotId);assert.equal(after.revision,before.revision+1);
  assert.deepEqual(after.shards.slice(1),before.shards.slice(1));
  for(const [id,bytes]of good)assert.deepEqual(env.MEDIA_BUCKET.map.get(missing.endpoint.keyPrefix+id),bytes);
  const status=await getShardVaultStatus(env);
  assert.equal(status.health.healthy_shards,7);assert.deepEqual(status.health.missing,[]);
});

test('preview bootstrap repairs the missing external shard locally without replacing six healthy external fragments',async t=>{
  const env=previewEnv(),inventory=[],remote=new Map();
  const originalFetch=globalThis.fetch;t.after(()=>{globalThis.fetch=originalFetch;});
  globalThis.fetch=async(input,init={})=>{
    const url=String(input),method=String(init.method||'GET');
    if(url==='https://inventory.example.test/list')return Response.json(inventory);
    if(url==='https://inventory.example.test/append'){
      inventory.push(JSON.parse(init.body));return new Response('',{status:200});
    }
    assert.match(url,/^https:\/\/shard-[0-6]\.example\.test\//,'fixture must never access the network');
    if(method==='PUT'){remote.set(url,new Uint8Array(init.body));return new Response('',{status:200});}
    return remote.has(url)?new Response(remote.get(url).slice()):new Response('',{status:404});
  };
  const external={...env,MEL_PUBLIC_ENDPOINTS_JSON:JSON.stringify(Array.from({length:7},(_,i)=>({
    id:'external-'+i,urlTemplate:'https://shard-'+i+'.example.test/{objectId}',method:'PUT',
    operatorDomain:'shard-'+i+'.example.test',providerId:'provider-'+i,
    jurisdiction:'FR',expectedRetentionDays:3650,maxBytes:1024*1024,
  }))),MEL_INVENTORY_LIST_URL:'https://inventory.example.test/list',MEL_INVENTORY_APPEND_URL:'https://inventory.example.test/append'};
  const created=await runShardVaultCycle(external,{force:true,skipExternalCode:true});
  assert.equal(created.ok,true,JSON.stringify(created));assert.equal(inventory.length,1);
  const before=inventory[0];
  await env.MEDIA_BUCKET.put(manifestKey,JSON.stringify(before));
  const missing=before.shards[0];
  remote.delete(missing.endpoint.urlTemplate.replace('{objectId}',missing.objectId));
  const good=new Map([...remote].map(([url,data])=>[url,data.slice()]));
  const result=await (await handleShardVaultStatus(bootstrapRequest(),env)).json();
  assert.equal(result.ok,true);assert.equal(result.snapshot_id,before.snapshotId);
  assert.equal(result.verified_roundtrip,true);
  const after=await manifestOf(env);
  assert.deepEqual(after.shards.slice(1),before.shards.slice(1));
  assert.equal(after.shards[0].index,missing.index);assert.equal(after.shards[0].mac,missing.mac);
  assert.equal(after.shards[0].endpoint.backend,'r2');
  assert.deepEqual(remote,good,'repair must not rewrite any healthy remote fragment');
  const status=await getShardVaultStatus(env);
  assert.equal(status.health.healthy_shards,7);assert.equal(status.active_external_registry.length,6);
});

test('an unrecoverable preview snapshot is not replaced by an empty seed or reported healthy',async()=>{
  const env=previewEnv();
  await handleShardVaultStatus(bootstrapRequest(),env);
  const before=await manifestOf(env);
  for(const d of before.shards.slice(0,4))env.MEDIA_BUCKET.map.delete(d.endpoint.keyPrefix+d.objectId);
  const response=await handleShardVaultStatus(bootstrapRequest(),env),result=await response.json();
  assert.equal(response.status,503);assert.equal(result.ok,false);
  assert.deepEqual(await manifestOf(env),before);
});

test('a repaired fragment must pass independent live MAC verification before bootstrap succeeds',async()=>{
  const bucket=new FakeR2(),env=previewEnv(bucket);
  await handleShardVaultStatus(bootstrapRequest(),env);
  const before=await manifestOf(env),missing=before.shards[0];
  bucket.map.delete(missing.endpoint.keyPrefix+missing.objectId);
  const realPut=bucket.put.bind(bucket);
  bucket.put=async(key,value)=>{
    if(key.startsWith('shardvault/objects/')){
      const invalid=new Uint8Array(value);invalid[0]^=1;return realPut(key,invalid);
    }
    return realPut(key,value);
  };
  const response=await handleShardVaultStatus(bootstrapRequest(),env),result=await response.json();
  assert.equal(response.status,503);assert.equal(result.ok,false);assert.notEqual(result.verified_roundtrip,true);
  assert.equal((await manifestOf(env)).snapshotId,before.snapshotId);
});

test('a corrupt existing manifest cannot be silently replaced with a fresh empty preview snapshot',async()=>{
  const env=previewEnv();
  await env.MEDIA_BUCKET.put(manifestKey,JSON.stringify({format:'MEL-ShardVault',snapshotId:'corrupt',manifestMac:'invalid'}));
  const before=env.MEDIA_BUCKET.map.get(manifestKey).slice();
  const response=await handleShardVaultStatus(bootstrapRequest(),env),result=await response.json();
  assert.equal(response.status,503);assert.equal(result.ok,false);
  assert.deepEqual(env.MEDIA_BUCKET.map.get(manifestKey),before);
  assert.equal(env.MEDIA_BUCKET.map.size,1);
});

test('a valid signed fallback snapshot can recover a corrupt latest pointer without creating a new seed',async()=>{
  const env=previewEnv();
  const first=await (await handleShardVaultStatus(bootstrapRequest(),env)).json();
  const before=await manifestOf(env);
  await env.MEDIA_BUCKET.put(manifestKey,JSON.stringify({...before,manifestMac:'invalid'}));
  const response=await handleShardVaultStatus(bootstrapRequest(),env),result=await response.json();
  assert.equal(response.status,200);assert.equal(result.ok,true);assert.equal(result.verified_roundtrip,true);
  assert.equal(result.snapshot_id,first.snapshot_id);
  assert.deepEqual(await manifestOf(env),before);
});

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

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isReleaseSmokeRequest } from '../src/core/security.js';

const token='s'.repeat(64);
const env={MEL_LAUNCH_BOOTSTRAP_TOKEN:token};

function request(path,{method='GET',supplied=token,smoke='1'}={}){
  return new Request('https://mel.test'+path,{
    method,
    headers:{
      'x-mel-release-smoke':smoke,
      'x-mel-launch-bootstrap':supplied,
      ...(method==='POST'?{'content-type':'application/json'}:{}),
    },
    ...(method==='POST'?{body:'{}'}:{}),
  });
}

test('release smoke can prepare ShardVault only on exact status/search paths',()=>{
  assert.equal(isReleaseSmokeRequest(request('/api/gen2/shardvault/status'),env),true);
  assert.equal(isReleaseSmokeRequest(request('/api/gen2/shardvault/search',{method:'POST'}),env),true);
  assert.equal(isReleaseSmokeRequest(request('/api/gen2/shardvault/status',{method:'POST'}),env),false);
  assert.equal(isReleaseSmokeRequest(request('/api/gen2/shardvault/search'),env),false);
  assert.equal(isReleaseSmokeRequest(request('/api/gen2/shardvault/activate',{method:'POST'}),env),false);
  assert.equal(isReleaseSmokeRequest(request('/api/gen2/shardvault/search',{method:'POST',supplied:'x'.repeat(64)}),env),false);
});

test('release workflow expands active ShardVault registry before launch bootstrap without lowering 7x gate',async()=>{
  const source=await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8');
  const search=source.indexOf('/api/gen2/shardvault/search');
  const bootstrap=source.indexOf('/api/internal/release-launch-bootstrap',search);
  assert.ok(search>0);
  assert.ok(bootstrap>search);
  assert.match(source,/for SHARD_STATUS_ATTEMPT in \$\(seq 1 12\)/);
  assert.match(source,/SHARD_STATUS_READY=0/);
  assert.match(source,/ShardVault status propagation attempt/);
  assert.match(source,/exit 46/);
  assert.match(source,/seq 1 17/);
  assert.match(source,/max_new_endpoints\\":1/);
  assert.match(source,/probe_limit\\":1/);
  assert.match(source,/probe_offset/);
  assert.match(source,/known_candidates_only\\\":true/);
  assert.match(source,/--max-time 175/);
  assert.match(source,/active_external_registry/);
  assert.match(source,/active<7/);
  assert.match(source,/PRODUCTION_SHARDVAULT_ACTIVE_EXTERNAL_LT_7/);
  assert.match(source,/PRODUCTION_SHARDVAULT_EXTERNAL_LT_7/);
  assert.doesNotMatch(source,/active_external_count\|\|0\)<3/);
});


test('unbounded ShardVault search keeps full live revalidation even with seven active targets',async()=>{
  const source=await readFile(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8');
  assert.match(source,/if\(\(!boundedMode\|\|active\.length<targetCount\)&&remainingBudget>0\)\{/);
  assert.match(source,/search_strategy:boundedMode\?'INCREMENTAL_BOUNDED':'FULL_REVALIDATION'/);
});


test('ShardVault roadmap pause is disabled in production and preview release configuration',async()=>{
  const [workflow,wrangler]=await Promise.all([
    readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8'),
    readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8'),
  ]);
  assert.match(workflow,/MEL_ROADMAP_SHARDVAULT_PAUSED:\s*'false'/);
  assert.doesNotMatch(workflow,/MEL_ROADMAP_SHARDVAULT_PAUSED:\s*'true'/);
  const paused=[...wrangler.matchAll(/"MEL_SHARDVAULT_ROADMAP_PAUSED"\s*:\s*"([^"]+)"/g)].map(m=>m[1]);
  assert.ok(paused.length>=2,'production and preview ShardVault pause vars must both be explicit');
  assert.deepEqual([...new Set(paused)],['false']);
});


test('release gives healthy ShardVault code sync a bounded backoff-aware completion window',async()=>{
  const source=await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8');
  assert.match(source,/CODE_SYNC_DEADLINE="$(( $(date +%s) + 720 ))"/);
  assert.match(source,/next_retry_at/);
  assert.match(source,/Math.max(2,Math.min(30/);
  assert.match(source,/PRODUCTION_CODE_SYNC_FINAL_NOT_COMPLETE/);
  assert.match(source,/PRODUCTION_CODE_SYNC_FINAL_NOT_COPIED/);
  assert.match(source,/PRODUCTION_CODE_SYNC_SUCCESSFUL_ENDPOINTS_LT_7/);
  assert.match(source,/PRODUCTION_CODE_SYNC_ROUNDTRIP_NOT_VERIFIED/);
  assert.match(source,/exit 48/);
  assert.doesNotMatch(source,/for CODE_SYNC_ATTEMPT in $(seq 1 12)/);
});

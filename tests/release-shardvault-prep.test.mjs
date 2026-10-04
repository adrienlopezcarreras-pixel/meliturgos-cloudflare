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
  assert.match(source,/SHARD_PROBE_LIMIT=1/);
  assert.match(source,/SHARD_PROBE_LIMIT=2/);
  assert.match(source,/probe_offset/);
  assert.match(source,/SHARD_KNOWN_ONLY=true/);
  assert.match(source,/SHARD_KNOWN_ONLY=false/);
  assert.match(source,/enabling live Internet discovery/);
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


test('temporary dev-light release accepts explicit PAUSED_FOR_ROADMAP code-sync without weakening normal 7x proof',async()=>{
  const [source,readiness]=await Promise.all([
    readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8'),
    readFile(new URL('../src/evolution/launch-readiness.js',import.meta.url),'utf8'),
  ]);
  assert.match(source,/status==='PAUSED_FOR_ROADMAP'/);
  assert.match(source,/process\.env\.MEL_ROADMAP_SHARDVAULT_PAUSED!=='true'/);
  assert.match(source,/--define "MEL_SHARDVAULT_ROADMAP_PAUSED:'\$\{MEL_ROADMAP_SHARDVAULT_PAUSED\}'"/);
  assert.match(readiness,/typeof MEL_SHARDVAULT_ROADMAP_PAUSED !== 'undefined'/);
  assert.match(readiness,/env\?\.MEL_SHARDVAULT_ROADMAP_PAUSED/);
  assert.match(source,/PRODUCTION_CODE_SYNC_UNEXPECTED_PAUSE/);
  assert.match(source,/PRODUCTION_CODE_SYNC_PAUSE_NOT_EXPLICIT/);
  assert.match(source,/status!=='COPIED'/);
  assert.match(source,/PRODUCTION_CODE_SYNC_TARGET_LT_7/);
  assert.match(source,/PRODUCTION_CODE_SYNC_SUCCESSFUL_ENDPOINTS_LT_7/);
  assert.match(source,/PRODUCTION_CODE_SYNC_ROUNDTRIP_NOT_VERIFIED/);
});


test('ShardVault roadmap pause is either closed out or explicitly temporary dev-light only',async()=>{
  const [workflow,wrangler]=await Promise.all([
    readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8'),
    readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8'),
  ]);
  const pausedInRelease=/MEL_ROADMAP_SHARDVAULT_PAUSED:\s*'true'/.test(workflow);
  if(pausedInRelease){
    assert.match(workflow,/TEMPORARY DEV-LIGHT MODE/);
    assert.match(workflow,/MUST be restored to 'false' before final validation\/closure/);
  }else{
    assert.match(workflow,/MEL_ROADMAP_SHARDVAULT_PAUSED:\s*'false'/);
  }
  const paused=[...wrangler.matchAll(/"MEL_SHARDVAULT_ROADMAP_PAUSED"\s*:\s*"([^"]+)"/g)].map(m=>m[1]);
  assert.ok(paused.length>=2,'production and preview ShardVault pause vars must both be explicit');
  assert.deepEqual([...new Set(paused)],['false'],'runtime ShardVault remains enabled; only the intermediate release proof may be paused');
});


test('release code-sync waits for future retry windows without consuming the no-progress stall budget',async()=>{
  const source=await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8');
  assert.match(source,/futureRetryAt=failuresList/);
  assert.match(source,/retryable===true&&row\?\.permanent!==true/);
  assert.match(source,/CODE_SYNC_WAITING_FOR_RETRY=1/);
  assert.match(source,/no-progress stall is not consumed/);
  assert.match(source,/Math\.min\(90,delta\+1\)/);
  assert.doesNotMatch(source,/\$CODE_SYNC_STATUS" = "RETRY_TARGETS".*Math\.min\(15,delta\)/s);
});

test('release job timeout is long enough for bounded ShardVault retry windows',async()=>{
  const source=await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8');
  const match=/jobs:\s*\n\s*deploy:[\s\S]*?timeout-minutes:\s*(\d+)/.exec(source);
  assert.ok(match,'deploy timeout must be explicit');
  assert.ok(Number(match[1])>=75,'deploy timeout must cover bounded ShardVault retry windows');
});

test('final ShardVault status tolerates bounded secret propagation',async()=>{
  const source=await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8');
  assert.match(source,/SHARD_FINAL_READY=0/);
  assert.match(source,/for SHARD_FINAL_ATTEMPT in \$\(seq 1 12\)/);
  assert.match(source,/ShardVault final status propagation attempt/);
  assert.match(source,/test "\$SHARD_FINAL_READY" = "1"/);
});

test('release rollback restores only the captured autonomy state through exact-SHA OIDC flow',async()=>{
  const source=await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8');
  assert.match(source,/id-token:\s*write/);
  assert.match(source,/Capture pre-deploy autonomy control/);
  assert.match(source,/\/api\/gen2\/autonomy\/control/);
  assert.match(source,/PREVIOUS_DEPLOYED_SHA/);
  assert.match(source,/PREVIOUS_AUTONOMY_PAUSED/);
  assert.match(source,/PREVIOUS_MAX_AUTONOMY/);
  assert.match(source,/release-rollback-restore/);
  assert.match(source,/x-mel-github-oidc/);
  assert.match(source,/audience=meliturgos-worker/);
  assert.match(source,/restore_sha=\$\{PREVIOUS_DEPLOYED_SHA\}/);
  assert.match(source,/Previous autonomy control staged in shared D1 before Worker rollback/);
  assert.match(source,/waiting for stable propagation/);
  const rollback=source.split('Automatic rollback on failed production verification')[1]||'';
  const staged=rollback.indexOf('restore_sha=${PREVIOUS_DEPLOYED_SHA}');
  const workerRollback=rollback.indexOf('deployments?force=true');
  const verifyControl=rollback.indexOf('/api/gen2/autonomy/control');
  assert.ok(staged>=0 && workerRollback>staged && verifyControl>workerRollback);
  assert.doesNotMatch(rollback,/wrangler secret put/);
  assert.match(rollback,/if \[ "\$\{PREVIOUS_AUTONOMY_PAUSED\}" = "true" \] && \[ "\$\{PREVIOUS_MAX_AUTONOMY\}" = "false" \]/);
});

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

test('release workflow requires a reconstructible 5-of-7 ShardVault quorum without weakening the 7x target',async()=>{
  const source=await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8');
  const search=source.indexOf('/api/gen2/shardvault/search');
  const bootstrap=source.indexOf('/api/internal/release-launch-bootstrap',search);
  assert.ok(search>0);
  assert.ok(bootstrap>search);
  assert.match(source,/SHARD_STATUS_READY=0/);
  assert.match(source,/SHARD_STATUS_DEADLINE_EPOCH=\$\(\( \$\(date \+%s\) \+ 360 \)\)/);
  assert.match(source,/while \[ "\$SHARD_STATUS_READY" != "1" \] && \[ "\$\(date \+%s\)" -lt "\$SHARD_STATUS_DEADLINE_EPOCH" \]/);
  assert.match(source,/waiting within the 360s propagation budget/);
  assert.match(source,/bounded 360s propagation window/);
  assert.match(source,/exit 46/);
  assert.match(source,/SHARD_RELEASE_QUORUM=5/);
  assert.match(source,/seq 1 17/);
  assert.match(source,/max_new_endpoints\\":1/);
  assert.match(source,/SHARD_PROBE_LIMIT=1/);
  assert.match(source,/probe_offset/);
  assert.match(source,/SHARD_KNOWN_ONLY=true/);
  assert.doesNotMatch(source,/SHARD_KNOWN_ONLY=false/);
  assert.doesNotMatch(source,/enabling live Internet discovery/);
  assert.match(source,/--max-time 90/);
  assert.match(source,/active_external_registry/);
  assert.match(source,/active>=quorum/);
  assert.match(source,/PRODUCTION_SHARDVAULT_ACTIVE_EXTERNAL_LT_RELEASE_QUORUM/);
  assert.match(source,/PRODUCTION_SHARDVAULT_EXTERNAL_LT_RELEASE_QUORUM/);
  assert.match(source,/PRODUCTION_EXTERNAL_CODE_RECONSTRUCTION_NOT_VERIFIED/);
  assert.match(source,/QUORUM_COPIED/);
  assert.doesNotMatch(source,/active_external_count\|\|0\)<3/);
});


test('unbounded ShardVault search keeps full live revalidation even with seven active targets',async()=>{
  const source=await readFile(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8');
  assert.match(source,/if\(\(!boundedMode\|\|active\.length<targetCount\)&&remainingBudget>0\)\{/);
  assert.match(source,/search_strategy:boundedMode\?'INCREMENTAL_KNOWN_POOL':'FULL_REVALIDATION'/);
});


test('temporary dev-light release accepts explicit PAUSED_FOR_ROADMAP code-sync without weakening the normal quorum proof',async()=>{
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
  assert.match(source,/\['COPIED','QUORUM_COPIED'\]\.includes\(status\)/);
  assert.match(source,/PRODUCTION_CODE_SYNC_TARGET_LT_7/);
  assert.match(source,/PRODUCTION_CODE_SYNC_SUCCESSFUL_ENDPOINTS_LT_RELEASE_QUORUM/);
  assert.match(source,/PRODUCTION_CODE_SYNC_QUORUM_RECONSTRUCTION_NOT_VERIFIED/);
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
  assert.match(source,/no active-attempt or no-progress budget is consumed/);
  assert.match(source,/Math\.min\(90,delta\+1\)/);
  assert.doesNotMatch(source,/\$CODE_SYNC_STATUS" = "RETRY_TARGETS".*Math\.min\(15,delta\)/s);
});

test('release code-sync does not burn active attempt budget while waiting on relay/retry windows',async()=>{
  const source=await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8');
  assert.match(source,/CODE_SYNC_ACTIVE_ATTEMPTS=0/);
  assert.match(source,/CODE_SYNC_MAX_ACTIVE_ATTEMPTS=32/);
  assert.match(source,/CODE_SYNC_DEADLINE_EPOCH=\$\(\( \$\(date \+%s\) \+ 1200 \)\)/);
  assert.match(source,/no active-attempt or no-progress budget is consumed/);
  assert.match(source,/CODE_SYNC_ACTIVE_ATTEMPTS=\$\(\(CODE_SYNC_ACTIVE_ATTEMPTS \+ 1\)\)/);
  assert.match(source,/bounded active-attempt\/deadline gate/);
  assert.doesNotMatch(source,/CODE_SYNC_MAX_ATTEMPTS=32/);
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

test('release capture normalizes legacy paused plus MAX contradiction fail-safe before rollback state is recorded',async()=>{
  const source=await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8');
  assert.match(source,/const maxAutonomy=paused\?false:reportedMax/);
  assert.match(source,/Legacy contradictory autonomy control normalized fail-safe/);
  assert.match(source,/PREVIOUS_MAX_AUTONOMY='\+String\(maxAutonomy\)/);
  assert.doesNotMatch(source,/PREDEPLOY_AUTONOMY_CONTROL_CONTRADICTORY/);
});

test('release rollback restores code through exact-SHA OIDC while preserving PAUSED/MAX=false safety',async()=>{
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
  assert.match(source,/Safe paused autonomy staged in shared D1 before Worker rollback/);
  assert.match(source,/waiting for stable propagation/);
  const rollback=source.split('Automatic rollback on failed production verification')[1]||'';
  const staged=rollback.indexOf('restore_sha=${PREVIOUS_DEPLOYED_SHA}');
  const workerRollback=rollback.indexOf('npx wrangler rollback');
  const verifyControl=rollback.indexOf('/api/gen2/autonomy/control');
  assert.ok(staged>=0 && workerRollback>staged && verifyControl>workerRollback);
  assert.match(rollback,/--name meliturgos/);
  assert.doesNotMatch(rollback,/deployments\?force=true/);
  assert.doesNotMatch(rollback,/wrangler secret put/);
  assert.match(rollback,/paused=true&max=false/);
  assert.match(rollback,/MAX kept disabled/);
});


test('ShardVault rejects workers.dev as an external persistence target to avoid Cloudflare same-zone Worker fetches',async()=>{
  const source=await readFile(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8');
  assert.match(source,/endsWith\('\.workers\.dev'\)/);
  assert.match(source,/WORKERS_DEV_SAME_ZONE_UNSAFE/);
  assert.match(source,/raw\.flatMap\(\(endpoint,index\)=>\{try\{return \[normalizeEndpoint\(endpoint,index\)\];\}catch\{return \[\];\}\}\)/);
});


test('release code-sync treats Cloudflare 1042 as a Worker visibility gap rather than ShardVault no-progress',async()=>{
  const source=await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8');
  assert.match(source,/error code: 1042/);
  assert.match(source,/transient Cloudflare Worker visibility gap 1042/);
  assert.match(source,/without consuming ShardVault attempt\/stall budget/);
  assert.match(source,/CODE_SYNC_WAIT=10/);
  const gap=source.indexOf('transient Cloudflare Worker visibility gap 1042');
  const stall=source.indexOf('CODE_SYNC_STALL=$((CODE_SYNC_STALL + 1))',gap);
  assert.ok(gap>=0 && stall>gap,'1042 branch must bypass the normal stall increment');
});

test('rollback waits for canonical Worker visibility before staging state or invoking Wrangler rollback',async()=>{
  const source=await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8');
  const rollback=source.split('Automatic rollback on failed production verification')[1]||'';
  const visible=rollback.indexOf('WORKER_VISIBLE=0');
  const preRestore=rollback.indexOf('release-rollback-restore');
  const wrangler=rollback.indexOf('npx wrangler rollback');
  assert.ok(visible>=0 && preRestore>visible && wrangler>preRestore);
  assert.match(rollback,/for WORKER_ATTEMPT in \$\(seq 1 30\)/);
  assert.match(rollback,/workers\/scripts\/meliturgos\/deployments/);
  assert.match(rollback,/"code"\[\[:space:\]\]\*:\[\[:space:\]\]\*10007/);
  assert.match(rollback,/Canonical Worker did not become observable before rollback safety deadline/);
  assert.match(rollback,/exit 58/);
});

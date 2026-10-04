import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('ShardVault has two real Cloudflare fallback stores and rotating discovery memory', () => {
  const runtime=fs.readFileSync(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8');
  assert.match(runtime,/cloudflare-r2-primary/);
  assert.match(runtime,/cloudflare-d1-secondary/);
  assert.match(runtime,/CREATE TABLE IF NOT EXISTS shardvault_objects/);
  assert.match(runtime,/backend==='d1'/);
  assert.match(runtime,/CLOUDFLARE_FALLBACK/);
  const discovery=fs.readFileSync(new URL('../src/continuity/autonomous-repositories.js',import.meta.url),'utf8');
  assert.match(discovery,/DISCOVERY_HISTORY_KEY/);
  assert.match(discovery,/QUERY_SETS/);
  assert.match(discovery,/generation=history\.generation\+1/);
  assert.match(discovery,/new_leads/);
});


test('bounded ShardVault activation rotates cached validated endpoints with probeOffset', () => {
  const source = fs.readFileSync(new URL('../src/continuity/shardvault-runtime.js', import.meta.url), 'utf8');
  assert.match(source, /const validatedOffset=Math\.max\(0,Math\.trunc\(Number\(probeOffset\)\|\|0\)\)/);
  assert.match(source, /\.slice\(validatedOffset,validatedOffset\+boundedMaxNew\)/);
  assert.doesNotMatch(source, /filter\(e=>!activeIds\.has\(e\.id\)\)\s*\.slice\(0,boundedMaxNew\)/);
});


test('bounded ShardVault maintenance excludes already active endpoints before applying probe offsets', () => {
  const runtime=fs.readFileSync(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8');
  const discovery=fs.readFileSync(new URL('../src/continuity/autonomous-repositories.js',import.meta.url),'utf8');
  assert.match(runtime,/const activeDiscoveryIds=active\.map\(endpoint=>endpoint\.id\)/);
  assert.match(runtime,/excludeEndpointIds:activeDiscoveryIds/);
  assert.match(discovery,/const excluded=new Set/);
  assert.match(discovery,/if\(excluded\.has\(c\.id\)\)/);
  assert.ok(
    discovery.indexOf('if(excluded.has(c.id))') < discovery.indexOf('eligibleRows.slice(boundedProbeOffset'),
    'active endpoint exclusions must happen before the bounded probe offset is applied'
  );
});

test('bounded release scan can skip broad Internet discovery while normal discovery stays enabled', () => {
  const runtime=fs.readFileSync(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8');
  const discovery=fs.readFileSync(new URL('../src/continuity/autonomous-repositories.js',import.meta.url),'utf8');
  const page=fs.readFileSync(new URL('../src/pages/shardvault-status.js',import.meta.url),'utf8');
  assert.match(runtime,/knownCandidatesOnly=false/);
  assert.match(runtime,/internetDiscovery:boundedMode\?false:knownCandidatesOnly!==true/);
  assert.match(discovery,/internetDiscovery=true/);
  assert.match(discovery,/internetDiscovery!==false/);
  assert.match(page,/knownCandidatesOnly:body\?\.known_candidates_only===true/);
});


test('code-sync discovery excludes used, quarantined and exhausted retry-cycle endpoints', () => {
  const runtime=fs.readFileSync(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8');
  const discovery=fs.readFileSync(new URL('../src/continuity/autonomous-repositories.js',import.meta.url),'utf8');
  assert.match(runtime,/const refreshExclusions=\[\.\.\.new Set\(\[/);
  assert.match(runtime,/\.\.\.used/);
  assert.match(runtime,/\.\.\.\(state\.failed_endpoint_ids\|\|\[\]\)/);
  assert.match(runtime,/retryCycleExhausted\?\(state\.attempted_endpoints\|\|\[\]\):\[\]/);
  assert.match(runtime,/excludeEndpointIds:refreshExclusions/);
  assert.match(discovery,/excludeEndpointIds=\[\]/);
  assert.match(discovery,/EXCLUDED_ENDPOINT/);
  assert.match(discovery,/excluded\.has\(c\.id\)/);
});


test('bounded ShardVault qualification stays small while activation still uses the real snapshot', () => {
  const runtime=fs.readFileSync(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8');
  assert.match(runtime,/const qualificationBytes=boundedMode[\s\S]*?\? 64\*1024[\s\S]*?: Math\.max\(64\*1024,Math\.min\(requiredBytes,256\*1024\)\)/);
  assert.match(runtime,/readValidatedExternalEndpoints\(env,qualificationBytes\)/);
  assert.match(runtime,/requiredBytes:qualificationBytes/);
  assert.match(runtime,/qualification_bytes:qualificationBytes/);
  assert.match(runtime,/runShardVaultCycle\(env,\{force:true,skipExternalCode:true,activeRegistryOnly:true\}\)/);
});

test('release ShardVault scan probes one documented candidate per bounded request', () => {
  const workflow=fs.readFileSync(new URL('../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8');
  assert.match(workflow,/SHARD_PROBE_LIMIT=1/);
  assert.match(workflow,/SHARD_OFFSET=\$\(\( \(SHARD_ATTEMPT - 1\) % 13 \)\)/);
  assert.match(workflow,/SHARD_KNOWN_ONLY=true/);
  assert.doesNotMatch(workflow,/enabling live Internet discovery/);
  assert.match(workflow,/--max-time 90/);
});


test('qualified ShardVault activation never re-enters Internet discovery', () => {
  const runtime=fs.readFileSync(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8');
  assert.match(runtime,/activeRegistryOnly=false/);
  assert.match(runtime,/activeRegistryOnly\|\|String\(env\?\.MEL_SHARDVAULT_AUTONOMOUS/);
  assert.match(runtime,/runShardVaultCycle\(env,\{force:true,skipExternalCode:true,activeRegistryOnly:true\}\)/);
  assert.match(runtime,/enrichAutonomous\(env,c,estimated,\{excludeEndpointIds,activeRegistryOnly\}\)/);
});


test('bounded ShardVault probing prioritizes durable replacement providers', () => {
  const source=fs.readFileSync(new URL('../src/continuity/autonomous-repositories.js',import.meta.url),'utf8');
  assert.match(source,/BOUNDED_PROVIDER_PRIORITY/);
  assert.match(source,/catbox-public/);
  assert.match(source,/dpaste-org-public/);
  assert.match(source,/paste-c-net-public/);
  assert.match(source,/const probePool=requestedProbeLimit==null/);
});

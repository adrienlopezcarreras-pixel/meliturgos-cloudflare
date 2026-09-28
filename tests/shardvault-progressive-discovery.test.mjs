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


test('bounded release scan can skip broad Internet discovery while normal discovery stays enabled', () => {
  const runtime=fs.readFileSync(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8');
  const discovery=fs.readFileSync(new URL('../src/continuity/autonomous-repositories.js',import.meta.url),'utf8');
  const page=fs.readFileSync(new URL('../src/pages/shardvault-status.js',import.meta.url),'utf8');
  assert.match(runtime,/knownCandidatesOnly=false/);
  assert.match(runtime,/internetDiscovery:knownCandidatesOnly!==true/);
  assert.match(discovery,/internetDiscovery=true/);
  assert.match(discovery,/internetDiscovery!==false/);
  assert.match(page,/knownCandidatesOnly:body\?\.known_candidates_only===true/);
});

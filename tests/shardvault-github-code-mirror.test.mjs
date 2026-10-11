import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { summarizeAutonomyLaunchCodeSync } from '../src/evolution/launch-readiness.js';

const runtime=await readFile(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8');
const mirrorWorkflow=await readFile(new URL('../.github/workflows/shardvault-github-code-mirror.yml',import.meta.url),'utf8');
const releaseWorkflow=await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8');
const wrangler=await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8');

test('GitHub code mirror is code-sync-only and gated to the final missing shard',()=>{
  assert.match(runtime,/D1GitHubActionRelayStore/);
  assert.match(runtime,/GITHUB_CODE_MIRROR_ID='github-actions-code-mirror'/);
  assert.match(runtime,/i===goal-1/);
  assert.match(runtime,/githubCodeMirrorEndpoint\(env,id,shard\.length\)/);
  assert.doesNotMatch(runtime,/active_external_endpoint.*github-actions-code-mirror/);
});

test('GitHub code mirror remains fail-closed until public byte-for-byte roundtrip succeeds',()=>{
  assert.match(runtime,/githubCodeMirrorUpload/);
  assert.match(runtime,/byteArraysEqual\(got,payload\)/);
  assert.match(runtime,/GITHUB_CODE_MIRROR_PENDING/);
  assert.match(runtime,/relay_pending:true/);
  assert.match(runtime,/downloadFragment\(env,e,d\)/);
  assert.match(runtime,/CODE_FRAGMENT_ROUNDTRIP_MISMATCH/);
  const cacheBusts=[...runtime.matchAll(/searchParams\.set\('mel_verify'/g)];
  assert.ok(cacheBusts.length>=2,'both pre-check and final mirror read must bypass stale raw GitHub cache');
});

test('GitHub mirror workflow is tightly bounded and proves the public raw object',()=>{
  assert.match(mirrorWorkflow,/permissions:\s*\n\s*contents: write/);
  assert.match(mirrorWorkflow,/^\s*\[\[ "\$R2_KEY" =~ \^shardvault\/github-code-mirror-staging\//m);
  assert.match(mirrorWorkflow,/^\s*\[\[ "\$MIRROR_PATH" =~ \^shardvault-code\//m);
  assert.match(mirrorWorkflow,/wrangler r2 object get/);
  assert.match(mirrorWorkflow,/sha256sum mirror-fragment\.bin/);
  assert.match(mirrorWorkflow,/\/contents\/\$\{MIRROR_PATH\}/);
  assert.match(mirrorWorkflow,/raw\.githubusercontent\.com/);
  assert.match(mirrorWorkflow,/PUBLISHED_COMMIT_SHA/);
  assert.match(mirrorWorkflow,/raw\.githubusercontent\.com\/\$\{GITHUB_REPOSITORY\}\/\$\{PUBLISHED_COMMIT_SHA\}/);
  assert.match(mirrorWorkflow,/for ATTEMPT in \$\(seq 1 30\)/);
  assert.match(mirrorWorkflow,/SHARDVAULT_GITHUB_CODE_MIRROR_ROUNDTRIP_VERIFIED/);
});

test('runtime allowlist and release loop can expedite only the mirror relay workflow',()=>{
  const matches=[...wrangler.matchAll(/MEL_GITHUB_WRITABLE_WORKFLOWS\"\s*:\s*\"([^\"]+)/g)].map(m=>m[1]);
  assert.ok(matches.length>=2);
  for(const value of matches)assert.ok(value.split(',').includes('shardvault-github-code-mirror.yml'));
  assert.match(releaseWorkflow,/Prepare and prove production autonomy launch evidence[\s\S]*GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(releaseWorkflow,/CODE_SYNC_RELAY_PENDING/);
  assert.match(releaseWorkflow,/actions\/workflows\/github-action-relay\.yml\/dispatches/);
  assert.match(releaseWorkflow,/Dispatched GitHub Action Relay for ShardVault mirror job/);
});


test('launch code-sync summary preserves mirror relay metadata needed by release dispatcher',()=>{
  const summary=summarizeAutonomyLaunchCodeSync({
    ok:true,
    external:{
      status:'RETRY_TARGETS',
      reason:'GITHUB_CODE_MIRROR_PENDING',
      target_count:7,
      completed_shards:6,
      pending_shards:1,
      relay_pending:true,
      relay_job_id:'relay-123',
      relay_status:'QUEUED',
    },
  });
  assert.equal(summary.relay_pending,true);
  assert.equal(summary.relay_job_id,'relay-123');
  assert.equal(summary.relay_status,'QUEUED');
  assert.equal(summary.reason,'GITHUB_CODE_MIRROR_PENDING');
});

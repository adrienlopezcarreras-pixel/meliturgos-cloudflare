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

test('preview mirror never targets main or production storage and requires exact 7th fragment',async()=>{
  const {validatePreviewContext,previewMirrorPending,publishPreviewMirror,PREVIEW_MIRROR_BRANCH}=
    await import('../scripts/fulfill-preview-code-mirror.mjs');
  const sha='a'.repeat(40);
  const env={GITHUB_SHA:sha,GITHUB_REPOSITORY:'adrienlopezcarreras-pixel/meliturgos-cloudflare',
    GITHUB_REF:'refs/heads/candidate/mel-clean-autonomy',GITHUB_REF_NAME:'candidate/mel-clean-autonomy',
    MEL_PREVIEW_R2_BUCKET:'meliturgos-preview-media-bucket',MEL_CRITICAL_CODE_SHARD_BYTES:'65536'};
  const config={r2_buckets:[{binding:'MEDIA_BUCKET',bucket_name:'meliturgos-private-media'}],
    d1_databases:[{binding:'DB',database_id:'prod'}],
    env:{preview:{r2_buckets:[{binding:'MEDIA_BUCKET',bucket_name:'meliturgos-preview-media-bucket'}],
      d1_databases:[{binding:'DB',database_id:'preview'}],
      vars:{MEL_RUNTIME_ENV:'preview',MEL_PREVIEW_ISOLATED:'true'}}}};
  const ctx=validatePreviewContext(env,config);
  assert.equal(PREVIEW_MIRROR_BRANCH,'shardvault-preview-mirror');
  assert.throws(()=>validatePreviewContext({...env,GITHUB_REF:'refs/heads/main'},config),/CANDIDATE_ONLY/);
  assert.throws(()=>validatePreviewContext({...env,MEL_PREVIEW_R2_BUCKET:'meliturgos-private-media'},config),/BUCKET_ISOLATION_UNPROVEN/);
  assert.throws(()=>validatePreviewContext(env,{...config,env:{preview:{...config.env.preview,
    d1_databases:[{binding:'DB',database_id:'prod'}]}}}),/D1_ISOLATION_UNPROVEN/);
  const pending={ok:true,status:'RETRY_TARGETS',sha,external:{reason:'GITHUB_CODE_MIRROR_PENDING',
    relay_pending:true,relay_job_id:'gh-relay-preview-123',target_count:7,completed_shards:6,pending_shards:1}};
  const out=previewMirrorPending(pending,ctx);
  assert.match(out.key,/^shardvault\/github-code-mirror-staging\/.*\/code-a{12}-shard-06-github\.bin$/);
  assert.match(out.path,/^shardvault-code\/.*\/code-a{12}-shard-06-github\.bin$/);
  assert.throws(()=>previewMirrorPending({...pending,external:{...pending.external,completed_shards:5}},ctx),/PENDING_PROOF_INVALID/);
  const bytes=new Uint8Array(65536);bytes.fill(17);
  const calls=[];
  const request=async(url,token,method='GET',data=null)=>{
    calls.push({url,method,data});
    if(url.endsWith('/git/ref/heads/shardvault-preview-mirror'))return {status:404,body:{}};
    if(url.endsWith('/git/refs'))return {status:201,body:{}};
    if(method==='PUT')return {status:201,body:{commit:{sha:'b'.repeat(40)}}};
    if(url.includes('/contents/')&&url.includes('?ref=')){
      if(calls.filter(x=>x.url.includes('?ref=')).length===1)return {status:404,body:{}};
      return {status:200,body:{encoding:'base64',content:Buffer.from(bytes).toString('base64')}};
    }
    throw Error('UNEXPECTED_GITHUB_PATH');
  };
  const result=await publishPreviewMirror(ctx,out,bytes,'x'.repeat(40),request);
  assert.equal(result.status,'EXACT_FRAGMENT_PUBLISHED_VERIFIED');
  assert.equal(calls.filter(x=>x.method==='PUT').length,1);
  assert.ok(calls.filter(x=>x.method==='PUT').every(x=>x.data.branch==='shardvault-preview-mirror'));
});
test('candidate preview uses only its own R2 and mirror path to finish 7/7',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/deploy-candidate-preview.yml',import.meta.url),'utf8');
  assert.match(workflow,/node scripts\/fulfill-preview-code-mirror\.mjs/);
  assert.match(workflow,/PREVIEW_GITHUB_CODE_MIRROR_PUBLISHED_TO_ISOLATED_BRANCH/);
  assert.match(workflow,/GITHUB_TOKEN: \${{ github\.token }}/);
  assert.match(workflow,/SYNC_STATUS.*COPIED.*SYNC_ENDPOINTS.*-ge 7/);
  const runtime=await readFile(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8');
  assert.match(runtime,/isolatedPreview\?'shardvault-preview-mirror':GITHUB_CODE_MIRROR_BRANCH/);
});

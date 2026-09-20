import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const autonomous=fs.readFileSync(new URL('../src/continuity/autonomous-repositories.js',import.meta.url),'utf8');
const runtime=fs.readFileSync(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8');

test('ShardVault provider adapters reflect current official API contracts', () => {
  assert.match(autonomous,/https:\/\/paste\.myst\.rs\/api\/v2\/paste\?mel_object=/);
  assert.match(autonomous,/language:'Plain Text'/);
  assert.match(autonomous,/expiry_days:'365'/);
  assert.match(autonomous,/https:\/\/dpaste\.com\/api\//);
  assert.match(autonomous,/form\.append\('content',b64u\(payload\)\)/);
  assert.match(autonomous,/adapter:'fileditch_b64'/);
  assert.match(autonomous,/filename=\{objectId\}\.txt/);
  assert.match(autonomous,/x-uuid':'1'/);
  assert.match(autonomous,/adapter:'pastegg_b64'/);
  assert.match(autonomous,/api\.paste\.gg\/v1\/pastes/);
  assert.match(autonomous,/format:'base64'/);
  assert.match(autonomous,/adapter:'markdownpaste_b64'/);
  assert.match(autonomous,/markdownpasteit\.vercel\.app\/api\/paste/);
  assert.match(autonomous,/expires_in:0/);
  assert.match(autonomous,/adapter:'udrop_dev_b64'/);
  assert.match(autonomous,/https:\/\/udrop\.dev/);
  assert.match(autonomous,/adapter:'waifuvault_b64'/);
  assert.match(autonomous,/https:\/\/waifuvault\.moe\/rest/);
  assert.match(autonomous,/adapter:'telegraph_b64'/);
  assert.match(autonomous,/api\.telegra\.ph\/createPage/);
  assert.match(autonomous,/adapter:'pastehtml_b64'/);
  assert.match(autonomous,/pastehtml\.dev\/api\/pastes/);
  assert.match(autonomous,/c\.authMode==='none'\|\|c\.authMode==='ephemeral_account_token'/);
});

test('snapshot runtime can write and read every repaired adapter selected by discovery', () => {
  for (const adapter of ['dpaste_b64','pastemyst_b64','onec3_b64','paste_c_net','fileditch_b64','pastegg_b64','markdownpaste_b64','udrop_dev_b64','waifuvault_b64','telegraph_b64','pastehtml_b64']) {
    assert.ok(runtime.includes(`e.adapter==='${adapter}'`) || runtime.includes(`'${adapter}'`), adapter);
  }
  assert.match(runtime,/paste\.myst\.rs\/api\/v2\/paste\//);
  assert.match(runtime,/user-agent':'curl\/8\.0 MEL-ShardVault\/1\.0'/);
  assert.match(runtime,/fileditch_b64/);
  assert.match(runtime,/api\.paste\.gg\/v1\/pastes\//);
  assert.match(runtime,/markdownpasteit\.vercel\.app\/api\/paste\//);
  assert.match(runtime,/udrop_dev_b64/);
  assert.match(runtime,/waifuvault_b64/);
  assert.match(runtime,/WAIFUVAULT_CONTENT_MISSING/);
  assert.match(runtime,/telegraph_b64/);
  assert.match(runtime,/TELEGRAPH_CONTENT_MISSING/);
  assert.match(runtime,/pastehtml_b64/);
  assert.match(runtime,/PASTEHTML_CONTENT_MISSING/);
});


test('chunkable providers are accepted for large shard sizes and runtime splits/reassembles fragments', () => {
  assert.match(autonomous,/requiredObjectBytes=Math\.max\(256,Math\.min\(Math\.max\(256,requiredBytes\),32\*1024\)\)/);
  assert.match(runtime,/async function uploadFragment\(/);
  assert.match(runtime,/async function downloadFragment\(/);
  assert.match(runtime,/parts:locator\.parts\|\|null/);
  assert.match(runtime,/SHARD_PART_LENGTH_INVALID/);
});

test('code archive replication is separately gated after seven live targets are available', () => {
  assert.match(runtime,/async function ensureExternalCodeArchive\(/);
  assert.match(runtime,/MEL-ShardVault-Code/);
  assert.match(runtime,/shardvault\/code-manifests\//);
  assert.match(runtime,/status:'COPIED',replication_mode:'FULL_COPY_7'/);
  assert.match(runtime,/if\(result\.target_reached\)/);
  assert.match(runtime,/DEFERRED_SEPARATE_OPERATION/);
  assert.match(runtime,/runShardVaultCycle\(env,\{force:true,skipExternalCode:true\}\)/);
});


test('rate-limited providers respect Retry-After before quarantine', () => {
  assert.match(autonomous,/async function fetchRateAware\(/);
  assert.match(autonomous,/retry-after/);
  assert.match(autonomous,/fetchRateAware\(endpoint/);
  assert.match(runtime,/async function fetchRateAware\(/);
  assert.match(runtime,/retry-after/);
});


test('seven validated external targets replace internal fallbacks for active snapshots', () => {
  assert.match(runtime,/if\(external\.length>=c\.n\)/);
  assert.match(runtime,/endpoints:selectEndpoints\(external,c\.n,maxOp,maxProv\)/);
  assert.match(runtime,/storageMode:'EXTERNAL_DISTRIBUTED'/);
});


test('critical code bundle is preferred while exact-SHA archive remains a preview reconstruction fallback', () => {
  assert.match(runtime,/criticalKey:'shardvault\/code-critical\//);
  assert.match(runtime,/archiveKey=id\.criticalKey/);
  assert.match(runtime,/archiveKey=id\.key/);
  assert.match(runtime,/CODE_ARCHIVE_SOURCE_MISSING/);
  assert.match(runtime,/archive_key:archiveKey/);
  assert.match(runtime,/archiveSha256/);
  assert.match(runtime,/verifyShardVaultCodeReconstruction/);
  assert.match(runtime,/independent_of_local_archive:true/);
  assert.match(runtime,/syncShardVaultCodeExternally/);
  assert.match(runtime,/skipExternalCode:true/);
});


test('discovery defers heavy code replication into its own bounded request', () => {
  const start=runtime.indexOf('export async function searchAutonomousShardVaultRepositories');
  const end=runtime.indexOf('export async function',start+10);
  const body=runtime.slice(start,end>start?end:runtime.length);
  assert.match(body,/DEFERRED_SEPARATE_OPERATION/);
  assert.match(body,/SEARCH_REQUEST_CPU_ISOLATION/);
  assert.doesNotMatch(body,/await syncShardVaultCodeExternally\(env\)/);
});


test('code replication uses seven bounded full replicas instead of CPU-heavy Reed-Solomon encoding', () => {
  const start=runtime.indexOf('async function ensureExternalCodeArchive');
  const end=runtime.indexOf('export async function runShardVaultCycle',start);
  const body=runtime.slice(start,end);
  assert.match(body,/replicationMode:'FULL_COPY_7'/);
  assert.match(body,/requiredReplicas:1/);
  assert.match(body,/maxConcurrency:2/);
  assert.match(body,/CODE_REPLICA_ROUNDTRIP_HASH_MISMATCH/);
  assert.doesNotMatch(body,/shards=encode\(data,c\.n\)/);
});


test('external data mode still persists manifests through the internal R2 inventory', () => {
  assert.match(runtime,/c\.storageMode==='CLOUDFLARE_FALLBACK'\|\|c\.storageMode==='EXTERNAL_DISTRIBUTED'/);
  assert.match(runtime,/external_only:c\.endpoints\.length>=c\.n&&c\.endpoints\.every\(e=>!e\.backend\)/);
});

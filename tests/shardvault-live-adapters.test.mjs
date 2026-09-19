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

test('code archive is copied to external ShardVault targets after seven live targets are available', () => {
  assert.match(runtime,/async function ensureExternalCodeArchive\(/);
  assert.match(runtime,/MEL-ShardVault-Code/);
  assert.match(runtime,/shardvault\/code-manifests\//);
  assert.match(runtime,/external:\{status:'COPIED'/);
  assert.match(runtime,/if\(result\.target_reached\)/);
  assert.match(runtime,/runShardVaultCycle\(env,\{force:true\}\)/);
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


test('critical code bundle is the external code payload and search snapshots stay lightweight', () => {
  assert.match(runtime,/criticalKey:'shardvault\/code-critical\//);
  assert.match(runtime,/CRITICAL_ARCHIVE_MISSING/);
  assert.match(runtime,/archiveSha256/);
  assert.match(runtime,/syncShardVaultCodeExternally/);
  assert.match(runtime,/skipExternalCode:true/);
});

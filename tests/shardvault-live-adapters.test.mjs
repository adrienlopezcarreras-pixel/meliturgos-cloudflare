import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const autonomous=fs.readFileSync(new URL('../src/continuity/autonomous-repositories.js',import.meta.url),'utf8');
const runtime=fs.readFileSync(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8');
const previewWorkflow=fs.readFileSync(new URL('../.github/workflows/deploy-candidate-preview.yml',import.meta.url),'utf8');
const releaseWorkflow=fs.readFileSync(new URL('../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8');
const wrangler=fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');

test('ShardVault provider adapters reflect current official API contracts', () => {
  assert.match(autonomous,/id:'0x0-st-public'/);
  assert.match(autonomous,/adapter:'zero_x0_binary'/);
  assert.match(autonomous,/https:\/\/0x0\.st\//);
  assert.match(autonomous,/expectedRetentionDays:180/);
  assert.match(autonomous,/id:'dpaste-org-public'/);
  assert.match(autonomous,/adapter:'dpaste_org_b64'/);
  assert.match(autonomous,/https:\/\/text\.dpaste\.org\/api\//);
  assert.match(autonomous,/form\.append\('expires','never'\)/);
  assert.match(autonomous,/page\+'\/raw\/'/);
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
  assert.match(autonomous,/PASTEGG_CONTENT_MISSING[\s\S]*content\?\.format[\s\S]*unb64u\(encoded\)[\s\S]*unb64\(encoded\)/);
  assert.match(autonomous,/format:'base64',value:b64\(payload\)/);
  assert.match(autonomous,/adapter:'markdownpaste_b64'/);
  assert.match(autonomous,/markdownpasteit\.vercel\.app\/api\/paste/);
  assert.doesNotMatch(autonomous,/expires_in:0/);
  assert.doesNotMatch(runtime,/expires_in:0/);
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
  for (const adapter of ['zero_x0_binary','dpaste_org_b64','dpaste_b64','pastemyst_b64','onec3_b64','paste_c_net','fileditch_b64','pastegg_b64','markdownpaste_b64','udrop_dev_b64','waifuvault_b64','telegraph_b64','pastehtml_b64']) {
    assert.ok(runtime.includes(`e.adapter==='${adapter}'`) || runtime.includes(`'${adapter}'`), adapter);
  }
  assert.match(runtime,/zero_x0_binary/);
  assert.match(runtime,/form\.append\('file',new Blob\(\[payload\]/);
  assert.match(runtime,/dpaste_org_b64/);
  assert.match(runtime,/form\.append\('expires','never'\)/);
  assert.match(runtime,/page\+'\/raw\/'/);
  assert.match(runtime,/paste\.myst\.rs\/api\/v2\/paste\//);
  assert.match(runtime,/user-agent':'curl\/8\.0 MEL-ShardVault\/1\.0'/);
  assert.match(runtime,/fileditch_b64/);
  assert.match(runtime,/api\.paste\.gg\/v1\/pastes\//);
  assert.match(runtime,/format:'base64',value:b64\(payload\)/);
  assert.match(runtime,/PASTEGG_CONTENT_MISSING[\s\S]*content\?\.format[\s\S]*unb64u\(encoded\)[\s\S]*unb64\(encoded\)/);
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
  assert.match(autonomous,/async function representativeProbe\(/);
  assert.match(autonomous,/representativeTargetBytes\(requiredBytes\)/);
  assert.match(autonomous,/representativeChunkLimit\(c\)/);
  assert.match(autonomous,/REPRESENTATIVE_REASSEMBLY_MISMATCH/);
  assert.match(autonomous,/REPRESENTATIVE_HASH_MISMATCH/);
  assert.match(runtime,/async function uploadFragment\(/);
  assert.match(runtime,/async function downloadFragment\(/);
  assert.match(runtime,/parts:locator\.parts\|\|null/);
  assert.match(runtime,/SHARD_PART_LENGTH_INVALID/);
});

test('code archive replication is separately gated after seven live targets are available', () => {
  assert.match(runtime,/async function ensureExternalCodeArchive\(/);
  assert.match(runtime,/MEL-ShardVault-Code/);
  assert.match(runtime,/shardvault\/code-manifests\//);
  assert.match(runtime,/syncStateKey:'shardvault\/code-sync-state\//);
  assert.match(runtime,/syncShardPrefix:'shardvault\/code-sync-shards\//);
  assert.match(runtime,/codeSyncExternalView\(state,goal,'COPIED'\)/);
  assert.match(runtime,/if\(result\.target_reached\)/);
  assert.match(runtime,/DEFERRED_SEPARATE_OPERATION/);
  assert.match(runtime,/runShardVaultCycle\(env,\{force:true,skipExternalCode:true\}\)/);
});


test('Telegraph account state is privately reused and code replica deadlines scale with chunk count', () => {
  assert.match(autonomous,/TELEGRAPH_ACCOUNT_KEY/);
  assert.match(autonomous,/readTelegraphAccessToken/);
  assert.match(autonomous,/writeTelegraphAccessToken/);
  assert.match(autonomous,/async function probe\(c, requiredBytes, policyMaxAgeDays=180, env=null\)/);
  assert.match(autonomous,/probe\(c,requiredBytes,policyMaxAgeDays,env\)/);
  assert.match(runtime,/TELEGRAPH_ACCOUNT_KEY/);
  assert.match(runtime,/telegraphAccessToken\(env,objectId\)/);
  assert.match(runtime,/codeFragmentDeadlineMs/);
  assert.match(runtime,/Math\.min\(150000,adaptive\)/);
  assert.match(runtime,/telegraphFloodWaitMs/);
  assert.match(runtime,/for\(let attempt=0;attempt<3;attempt\+\+\)/);
  assert.match(runtime,/fetchRateAware\(endpoint,\{method:'POST'.*\},15000,4,10000,30000\)/s);
  assert.match(runtime,/markdownpaste_b64'\)return Math\.max\(256,Math\.min\(24000/);
  assert.match(runtime,/FLOOD\|RATE\[_ -\]\?LIMIT/);
});

test('preview requires seven representative provider proofs before reconstruction', () => {
  assert.match(previewWorkflow,/int\(d\.get\('probed'\) or 0\) >= 6/);
  assert.match(previewWorkflow,/int\(d\.get\('representative_validated_count'\) or 0\) >= 7/);
  assert.match(previewWorkflow,/SHARDVAULT_FRESH_LIVE_PROBES_LT_6/);
  assert.match(previewWorkflow,/SHARDVAULT_REPRESENTATIVE_VALIDATED_LT_7/);
  assert.match(previewWorkflow,/full representative chunk\/write\/read\/reassembly\/hash proof/);
});

test('rate-limited providers respect Retry-After before quarantine', () => {
  assert.match(autonomous,/async function fetchRateAware\(/);
  assert.match(autonomous,/retry-after/);
  assert.match(autonomous,/fetchRateAware\(endpoint/);
  assert.match(autonomous,/fetchRateAware\(endpoint,\{method:'POST'.*\},12000,4,10000,30000\)/s);
  assert.match(autonomous,/telegraphFloodWaitMs/);
  assert.match(autonomous,/for\(let attempt=0;attempt<3;attempt\+\+\)/);
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
  assert.match(runtime,/const preferred=critical\|\|object/);
  assert.match(runtime,/const preferredKey=critical\?id\.criticalKey:id\.key/);
  assert.match(runtime,/source:critical\?'CRITICAL_BUNDLE':'FULL_ARCHIVE'/);
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


test('code replication uses resumable RS 4-of-7 shards with one external shard per request', () => {
  const start=runtime.indexOf('async function ensureExternalCodeArchive');
  const end=runtime.indexOf('export async function runShardVaultCycle',start);
  const body=runtime.slice(start,end);
  assert.match(body,/replicationMode:'RS_4_OF_7'/);
  assert.match(body,/const prepared=encode\(data,n\)/);
  assert.match(body,/temp_shard_keys:tempShardKeys/);
  assert.match(body,/const i=descriptors\.length,tempKey=state\.temp_shard_keys\?\.\[i\]/);
  assert.match(body,/state\.shards\.push\(descriptor\)/);
  assert.match(body,/writeCodeSyncState\(env,id,state\)/);
  assert.ok(runtime.includes("rememberValidatedExternalEndpoints(env,[...(report.qualified||[]),...(report.selected||[])])"));
  assert.ok(runtime.includes("rememberCodeCandidateEndpoints(env,[...(report.qualified||[]),...(report.selected||[]),...(report.eligible||[])])"));
  assert.match(runtime,/CODE_CANDIDATES_KEY/);
  assert.match(body,/readCodeCandidateEndpoints/);
  assert.match(body,/const provenEndpoint=\{\.\.\.e,/);
  assert.match(body,/rememberValidatedExternalEndpoints\(env,\[provenEndpoint\]\)/);
  assert.match(body,/NO_READY_VALIDATED_CODE_TARGETS/);
  assert.doesNotMatch(body,/state\.failed_endpoint_ids=\[\]/);
  assert.match(runtime,/CALL_CODE_SYNC_AGAIN/);
  assert.match(runtime,/CODE_FRAGMENT_DEADLINE_EXCEEDED/);
  assert.match(body,/CODE_FRAGMENT_ROUNDTRIP_MISMATCH/);
  assert.doesNotMatch(body,/assignDistinctExternalTargets\(replicas,candidates/);
});


test('external data mode still persists manifests through the internal R2 inventory', () => {
  assert.match(runtime,/c\.storageMode==='CLOUDFLARE_FALLBACK'\|\|c\.storageMode==='EXTERNAL_DISTRIBUTED'/);
  assert.match(runtime,/external_only:c\.endpoints\.length>=c\.n&&c\.endpoints\.every\(e=>!e\.backend\)/);
});


test('new durable providers remain candidates until representative full-fragment qualification', () => {
  assert.match(autonomous,/id:'0x0-st-public'[\s\S]*evidenceMode:'documented_api'/);
  assert.match(autonomous,/id:'dpaste-org-public'[\s\S]*evidenceMode:'documented_api'/);
  assert.match(autonomous,/reviewed_documentation_candidate/);
  assert.match(autonomous,/representative_full_fragment_roundtrip/);
  assert.match(autonomous,/probed\.push\(await probe\(c,requiredBytes,policyMaxAgeDays,env\)\)/);
  assert.match(autonomous,/representativeProbe\(c,requiredBytes,env,representativeProofs\)/);
  assert.match(runtime,/const provenEndpoint=\{\.\.\.e,/);
  assert.match(runtime,/rememberValidatedExternalEndpoints\(env,\[provenEndpoint\]\)/);
});


test('validated registry rejects legacy small-probe-only endpoints and preserves representative proof metadata', () => {
  assert.match(runtime,/function endpointRepresentativeProofValid\(/);
  assert.match(runtime,/representativeBytes:Number\(e\.representativeBytes\)\|\|0/);
  assert.match(runtime,/representativeSha256:e\.representativeSha256\|\|null/);
  assert.match(runtime,/readValidatedExternalEndpoints\(env,requiredBytes=0\)/);
  assert.match(runtime,/endpointMeetsDurability\(env,e\)&&endpointRepresentativeProofValid\(env,e,requiredBytes\)/);
  assert.match(runtime,/representativeVerifiedAt:new Date\(\)\.toISOString\(\)/);
  assert.match(runtime,/evidenceVerification:'representative_full_fragment_roundtrip'/);
});

test('autonomous qualification caches heavy representative proofs and reruns them when stale or undersized', () => {
  assert.match(autonomous,/REPRESENTATIVE_PROOF_KEY/);
  assert.match(autonomous,/representativeProofFresh\(/);
  assert.match(autonomous,/MEL_SHARDVAULT_REPRESENTATIVE_PROOF_HOURS/);
  assert.match(autonomous,/representative_bytes:target/);
  assert.match(autonomous,/representative_full_fragment_roundtrip_cached/);
  assert.match(autonomous,/representative_qualified:qualified\.length/);
});


test('representative load is sized from the exact critical code bundle and enforced by CI', () => {
  assert.match(runtime,/typeof MEL_CRITICAL_CODE_BUNDLE_BYTES!=='undefined'/);
  assert.match(runtime,/declared_critical_bundle_bytes:/);
  assert.match(runtime,/Math\.ceil\(\(archiveBytes\+32\)\/Math\.max\(2,Number\(c\.k\)\|\|4\)\)/);
  assert.match(previewWorkflow,/MEL_CRITICAL_CODE_BUNDLE_BYTES=\$BUNDLE_BYTES/);
  assert.match(previewWorkflow,/MEL_CRITICAL_CODE_SHARD_BYTES=\$SHARD_BYTES/);
  assert.match(previewWorkflow,/--define "MEL_CRITICAL_CODE_BUNDLE_BYTES:\$\{MEL_CRITICAL_CODE_BUNDLE_BYTES\}"/);
  assert.match(previewWorkflow,/SHARDVAULT_REPRESENTATIVE_SIZE_UNDERSIZED/);
  assert.match(releaseWorkflow,/MEL_CRITICAL_CODE_BUNDLE_BYTES=\$BUNDLE_BYTES/);
  assert.match(releaseWorkflow,/--define "MEL_CRITICAL_CODE_BUNDLE_BYTES:\$\{MEL_CRITICAL_CODE_BUNDLE_BYTES\}"/);
  assert.equal((wrangler.match(/"MEL_AUTONOMOUS_PROBE_LIMIT": "20"/g)||[]).length,2);
});


test('critical bundle is bound through the runtime before qualification', () => {
  assert.match(runtime,/export async function storeCriticalCodeBundle\(/);
  assert.match(runtime,/CRITICAL_BUNDLE_ROUNDTRIP_MISMATCH/);
  assert.match(previewWorkflow,/Bind exact critical bundle through preview Worker/);
  assert.match(previewWorkflow,/\/api\/gen2\/shardvault\/code-source/);
  assert.match(previewWorkflow,/SHARDVAULT_CRITICAL_SOURCE_NOT_BOUND/);
  assert.match(previewWorkflow,/SHARDVAULT_CRITICAL_SOURCE_SIZE_MISMATCH/);
});

test('code sync requires fresh representative proof and invalidates a target after critical-copy failure', () => {
  assert.match(runtime,/const proofWeight=e=>\[/);
  assert.match(runtime,/if\(!current\|\|better\(e,current\)\)by\.set\(e\.id,e\)/);
  assert.match(runtime,/uniqueExternalCandidates\(env,endpoints\)[\s\S]*filter\(e=>endpointRepresentativeProofValid\(env,e,requiredBytes\)\)/);
  assert.match(runtime,/rankExternalCodeCandidates\(env,\[\.\.\.validated,\.\.\.extra,\.\.\.codeCandidates\],shard\.length\)/);
  assert.doesNotMatch(runtime,/rankExternalCodeCandidates\(env,\[\.\.\.validated,\.\.\.extra,\.\.\.\(c\.endpoints/);
  assert.match(runtime,/invalidateCodeTargetQualification\(env,e\.id\)/);
  assert.match(runtime,/removeEndpointFromRegistry\(env,VALIDATED_ENDPOINTS_KEY,endpointId\)/);
  assert.match(runtime,/removeEndpointFromRegistry\(env,CODE_CANDIDATES_KEY,endpointId\)/);
  assert.match(runtime,/invalidateRepresentativeProof\(env,endpointId\)/);
  assert.match(autonomous,/export async function invalidateRepresentativeProof\(/);
  assert.match(autonomous,/delete next\[id\]/);
  assert.match(runtime,/representativeLatencyMs/);
  assert.match(runtime,/const proofBudget=representativeLatency>0\?Math\.ceil\(representativeLatency\*1\.35\+10000\):0/);
  assert.match(autonomous,/REPRESENTATIVE_DEADLINE_EXCEEDED/);
  assert.match(autonomous,/deadline_ms:deadline/);
});

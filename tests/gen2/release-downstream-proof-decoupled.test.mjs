import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('decoupled downstream proof never deploys, rolls back, toggles MAX, or mutates launch secrets', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/release-downstream-proof-decoupled.yml',import.meta.url),'utf8');
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/expected_sha:/);
  assert.match(workflow,/x-mel-parallel-proof/);
  assert.match(workflow,/MEL_PARALLEL_PROOF_V1:/);
  assert.match(workflow,/api\/gen2\/code\/self-check/);
  assert.match(workflow,/browser\.execute/);
  assert.match(workflow,/mel-file-browser-production-proof/);
  assert.match(workflow,/sovereignty-proof/);
  assert.match(workflow,/MEL_SOV_01_DONE_VERIFIED_ELIGIBLE/);
  assert.match(workflow,/Capture exact-SHA CapabilityBus health/);
  assert.match(workflow,/capability-health\.json/);
  assert.match(workflow,/api\/gen2\/capabilities\?refresh=1/);
  assert.doesNotMatch(workflow,/wrangler\s+(?:deploy|secret|versions)/);
  assert.doesNotMatch(workflow,/MEL_LAUNCH_BOOTSTRAP_TOKEN/);
  assert.doesNotMatch(workflow,/release-rollback-restore|automatic rollback|wrangler\s+rollback|deployments?[^\n]{0,80}rollback/i);
  assert.doesNotMatch(workflow,/max[_ -]?autonomy|MAX 100/i);
});

test('decoupled MEL-FILE proof mirrors the successful canonical browser shape after exact-SHA readiness', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/release-downstream-proof-decoupled.yml',import.meta.url),'utf8');
  const fileBlock=workflow.split('\n  file:\n')[1]?.split('\n  sovereignty:\n')[0]||'';
  assert.doesNotMatch(fileBlock,/needs:\s*browser/);
  assert.match(fileBlock,/api\/teacher\/launch-readiness/);
  assert.match(fileBlock,/GO_FOR_SUPERVISED_AUTONOMY/);
  assert.match(fileBlock,/candidate_sha/);
  assert.match(fileBlock,/for ATTEMPT in \$\(seq 1 180\)/);
  assert.match(fileBlock,/timeout-minutes:\s*45/);
  assert.match(fileBlock,/MEL-FILE target SHA is no longer deployed/);
  assert.match(fileBlock,/mel-file-current-sha\.json/);
  assert.match(fileBlock,/exit 42/);
  assert.ok(fileBlock.indexOf('GO_FOR_SUPERVISED_AUTONOMY')<fileBlock.indexOf('FILE_READY=0'),'release readiness must gate MEL-FILE browser pressure');
  assert.match(fileBlock,/SESSION="decoupled-file-\$\{TARGET_SHA:0:12\}-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}"/);
  assert.doesNotMatch(fileBlock,/SESSION="[^"]*\$\{ATTEMPT\}"/);
  assert.match(fileBlock,/for ATTEMPT in \$\(seq 1 12\)/);
  assert.match(fileBlock,/url:origin\+'\/'/);
  assert.match(fileBlock,/url:origin\+'\/professor'/);
  assert.doesNotMatch(fileBlock,/proof_sha=/);
  assert.doesNotMatch(fileBlock,/view=chat/);
  assert.match(fileBlock,/max_steps:7/);
  assert.match(fileBlock,/upload-normal/);
  assert.match(fileBlock,/wait-normal/);
  assert.match(fileBlock,/upload-full/);
  assert.match(fileBlock,/wait-full/);
  assert.match(fileBlock,/steps_completed\|\|0\)!==7/);
  assert.match(fileBlock,/retry \$\{ATTEMPT\}\/12 in the stable browser session/);
  assert.match(fileBlock,/monolithic_browser_session:true/);
  assert.match(fileBlock,/canonical_page_shape:true/);
  assert.match(fileBlock,/stable_session_across_retries:true/);
  assert.match(fileBlock,/000\|200\|408\|409\|429\|500\|502\|503\|504/);
  assert.match(fileBlock,/Non-retryable MEL-FILE canonical-shape proof status/);
  assert.match(fileBlock,/failed_step_id/);
  assert.match(fileBlock,/mel-file-preflight\.json/);
  assert.match(fileBlock,/\/api\/files\/upload/);
  assert.match(fileBlock,/MEL_FILE_PARALLEL_API_PREFLIGHT_FAILED/);
  assert.match(fileBlock,/mel-file-ui-diagnostic\.json/);
  assert.match(fileBlock,/diag-status/);
  assert.match(fileBlock,/diag-attachments/);
  assert.doesNotMatch(fileBlock,/file-normal-wait\.json|file-full-wait\.json/);
});

test('decoupled MEL-FILE HTTP envelope exceeds the two bounded asynchronous DOM waits', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/release-downstream-proof-decoupled.yml',import.meta.url),'utf8');
  const block=workflow.split('\n  file:\n')[1]?.split('\n  sovereignty:\n')[0]||'';
  assert.match(block,/FILE_CODE="\$\(curl --silent --show-error --max-time 180/);
  assert.match(block,/wait-normal'.*timeout_ms:60000/);
  assert.match(block,/wait-full'.*timeout_ms:60000/);
});

test('decoupled browser proof retries bounded transient failures before gating MEL-FILE', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/release-downstream-proof-decoupled.yml',import.meta.url),'utf8');
  assert.match(workflow,/BROWSER_READY=0/);
  assert.match(workflow,/for ATTEMPT in \$\(seq 1 6\)/);
  assert.match(workflow,/Transient browser\.execute proof status/);
  assert.match(workflow,/Non-retryable browser\.execute proof status/);
});

test('sovereignty proof binds exact SHA through code self-check instead of requiring duplicate SHA metadata', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/release-downstream-proof-decoupled.yml',import.meta.url),'utf8');
  assert.match(workflow,/sovereignty-sha-status\.json/);
  assert.match(workflow,/api\/gen2\/code\/self-check/);
  const statusBlock=workflow.split("output sovereignty.json")[1]?.split("SOV_CODE=")[0]||'';
  assert.doesNotMatch(statusBlock,/d\?\.deployed_sha/);
  assert.match(statusBlock,/TECHNICAL_SOVEREIGNTY_STATUS/);
});

test('decoupled sovereignty waits for canonical exact-SHA deploy job success instead of aggregate workflow success', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/release-downstream-proof-decoupled.yml',import.meta.url),'utf8');
  const block=workflow.split('\n  sovereignty:\n')[1]?.split('\n  summary:\n')[0]||'';
  assert.match(workflow,/actions:\s*read/);
  assert.match(block,/GITHUB_TOKEN/);
  assert.match(block,/sovereignty-release-runs\.json/);
  assert.match(block,/actions\/workflows\/deploy-cloudflare-release\.yml\/runs\?head_sha=\$\{TARGET_SHA\}/);
  assert.match(block,/actions\/runs\/\$\{RELEASE_RUN_ID\}\/jobs\?per_page=100/);
  assert.match(block,/String\(job\?\.name\|\|''\)==='deploy'/);
  assert.match(block,/completed:success/);
  assert.match(block,/SOV proof waiting for canonical exact-SHA deploy job success/);
  assert.match(block,/Decoupled SOV fast path: exact-SHA final proof already valid/);
  assert.match(block,/exact_sha_fast_path:true/);
  assert.doesNotMatch(block,/SOV proof waiting for canonical exact-SHA release success/);
  const ready=block.indexOf('test "${RELEASE_DEPLOY_SUCCESS}" = "1"');
  const fast=block.indexOf('FAST_SOV_CODE=');
  const selective=block.indexOf('if layer_covered "ai"; then');
  assert.ok(ready>0&&fast>ready&&selective>fast,'SOV fast path and selective missing-layer refresh must start only after canonical exact-SHA deploy job success');
});
test('source-control prevalidation surfaces a sanitized blocked reason for strict SOV diagnostics', async () => {
  const runtime=await readFile(new URL('../../src/portability/companion-source-control-prevalidation-runtime.js',import.meta.url),'utf8');
  const validator=await readFile(new URL('../../src/portability/sovereignty-candidate-validator.js',import.meta.url),'utf8');
  assert.match(runtime,/blockedResult\.code\|\|blockedResult\.validation_status\|\|blockedResult\.reason/);
  assert.match(runtime,/reason:validation\.prevalidated>0\?null:blockedReason/);
  assert.match(validator,/code:clean\(error\?\.code\|\|error\?\.message,180\)\|\|null/);
});

test('decoupled sovereignty proof refreshes only missing bounded domains before final status', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/release-downstream-proof-decoupled.yml',import.meta.url),'utf8');
  assert.match(workflow,/layer_covered\(\)/);
  assert.match(workflow,/if layer_covered "ai"/);
  assert.match(workflow,/if layer_covered "source_control"/);
  assert.match(workflow,/for STEP in runtime storage database ci_cd secrets_identity scheduler observability/);
  assert.match(workflow,/if layer_covered "\$\{STEP\}"/);
  assert.match(workflow,/refresh_sov_target "infrastructure" "\$\{STEP\}"/);
  assert.match(workflow,/for STEP in resolve prepare readback rollback finalize/);
  assert.match(workflow,/if layer_covered "backup_restore"/);
  assert.match(workflow,/ALREADY_COVERED/);
  assert.match(workflow,/release-launch-bootstrap\?\$\{QUERY\}/);
  assert.match(workflow,/MEL_SOV_01_REFRESH_STEP_VERIFIED/);
  assert.match(workflow,/MEL_SOV_01_REFRESH_SAFETY_FAILED/);
  const selective=workflow.indexOf('if layer_covered "ai"; then');
  const infrastructureStages=workflow.indexOf('for STEP in runtime storage database ci_cd secrets_identity scheduler observability; do');
  const backupStages=workflow.indexOf('for STEP in resolve prepare readback rollback finalize; do');
  const status=workflow.indexOf('output sovereignty.json');
  const finalProof=workflow.indexOf('output mel-sov-01.json');
  assert.ok(selective>0&&infrastructureStages>selective&&backupStages>infrastructureStages&&status>backupStages&&finalProof>status,'selective missing-layer refreshes must complete before status and final proof');
});

test('decoupled sovereignty refreshes retry only bounded transient pressure and preserve a sanitized failure artifact', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/release-downstream-proof-decoupled.yml',import.meta.url),'utf8');
  assert.match(workflow,/REFRESH_READY=0/);
  const block=workflow.split('\n  sovereignty:\n')[1]?.split('\n  summary:\n')[0]||'';
  assert.match(block,/local MAX_ATTEMPTS=4/);
  assert.match(block,/if \[ "\$\{TARGET\}" = "ai_local" \]; then/);
  assert.match(block,/MAX_ATTEMPTS=8/);
  assert.match(block,/for ATTEMPT in \$\(seq 1 "\$\{MAX_ATTEMPTS\}"\)/);
  assert.match(block,/COMPANION_ENGINE_UPDATE_REQUIRED/);
  assert.match(block,/sleep 45/);
  assert.match(block,/--max-time 55/);
  assert.match(workflow,/BOOTSTRAP_AUTH_REQUIRED/);
  assert.match(workflow,/Decoupled SOV proof auth is still propagating/);
  assert.match(workflow,/SOV_BACKUP_GOOGLE_DRIVE_RECONSENT_REQUIRED/);
  assert.match(workflow,/Google Drive OAuth re-consent is required/);
  assert.match(workflow,/SOV_BACKUP_GOOGLE_DRIVE_API_DISABLED/);
  assert.match(workflow,/SOV_BACKUP_GOOGLE_DRIVE_PERMISSION_DENIED/);
  assert.match(workflow,/SOV_BACKUP_GOOGLE_DRIVE_QUOTA_EXCEEDED/);
  assert.match(workflow,/Google Drive API is disabled/);
  assert.match(workflow,/000\|409\|429\|500\|502\|503\|504/);
  assert.match(workflow,/Transient decoupled SOV refresh/);
  assert.match(workflow,/Non-retryable decoupled SOV refresh/);
  assert.match(workflow,/status:'MEL_SOV_01_REFRESH_FAILED'/);
  assert.match(workflow,/secret_values_exposed:false/);
});

test('release installs exact-SHA immutable proof token and dispatches downstream proof before ShardVault launch evidence', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8');
  assert.match(workflow,/MEL_PARALLEL_PROOF_TOKEN:parallelProofToken/);
  assert.match(workflow,/meliturgos-parallel-proof-salt-v1/);
  assert.match(workflow,/MEL_PARALLEL_PROOF_V1:/);
  assert.match(workflow,/Dispatch decoupled downstream production proofs/);
  assert.match(workflow,/release-downstream-proof-decoupled\.yml\/dispatches/);
  assert.match(workflow,/inputs:\{expected_sha:process\.env\.EXPECTED_SHA\}/);
  const dispatch=workflow.indexOf('Dispatch decoupled downstream production proofs');
  const shardvault=workflow.indexOf('Prepare and prove production autonomy launch evidence');
  assert.ok(dispatch>0&&shardvault>dispatch,'parallel proof must be launched before blocking ShardVault evidence');
});

test('parallel proof auth is narrower than the normal release-smoke token', async () => {
  const security=await readFile(new URL('../../src/core/security.js',import.meta.url),'utf8');
  assert.match(security,/PARALLEL_PROOF_ALLOWLIST/);
  assert.match(security,/MEL_PARALLEL_PROOF_TOKEN/);
  assert.match(security,/x-mel-parallel-proof/);
  const block=security.split('const PARALLEL_PROOF_ALLOWLIST')[1]?.split('export function isReleaseSmokeRequest')[0]||'';
  assert.match(block,/api\/gen2\/capabilities\/execute/);
  assert.match(block,/api\/gen2\/code\/self-check/);
  assert.match(block,/api\/gen2\/capabilities/);
  assert.match(block,/api\/gen2\/autonomy\/sovereignty/);
  assert.match(block,/api\/chat/);
  assert.equal([...block.matchAll(/'([^']+)'/g)].some(([,route])=>route.includes('/connections/')&&route.endsWith('/save')),false);
  assert.match(block,/api\/files\/upload/);
  const nativeChat=await readFile(new URL('../../src/api/native-chat.js',import.meta.url),'utf8');
  assert.match(nativeChat,/const capability = releaseSmoke\s*\? inferredCapability/);
  assert.match(nativeChat,/allowed_capabilities:\s*\['code\.read','code\.search'\]/);
  const upload=await readFile(new URL('../../src/api/file-upload.js',import.meta.url),'utf8');
  assert.match(upload,/MEL_FILE_PROOF_UPLOAD_REJECTED/);
  assert.match(upload,/MEL_FILE_PROOF_PAYLOAD_INVALID/);
});


test('decoupled capability health proof is read-only, sanitized, and grouped by provider', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/release-downstream-proof-decoupled.yml',import.meta.url),'utf8');
  const block=workflow.split('\n  capabilities:\n')[1]?.split('\n  browser:\n')[0]||'';
  assert.match(block,/api\/gen2\/capabilities\?refresh=1/);
  assert.match(block,/source_sha/);
  assert.match(block,/by_provider/);
  assert.match(block,/by_health/);
  assert.match(block,/health_detail/);
  assert.match(block,/secret_values_exposed:false/);
  assert.match(block,/api\/gen2\/code\/self-check/);
  assert.match(block,/for ATTEMPT in \$\(seq 1 12\)/);
  assert.match(block,/Transient CapabilityBus health status/);
  assert.match(block,/for ATTEMPT in \$\(seq 1 8\)/);
  assert.match(block,/EXACT_SHA_READINESS_FAILED/);
  assert.match(block,/CAPABILITY_HEALTH_REQUEST_FAILED/);
  assert.match(block,/mel\.downstream-capability-health\/v2/);
  assert.match(block,/exact_sha_verified:true/);
  assert.match(block,/if: always\(\)/);
  assert.match(block,/MEL_BACKUP_ENCRYPTION_KEY_B64/);
  assert.doesNotMatch(block,/MEL_PARALLEL_PROOF_KEY_B64/);
  assert.doesNotMatch(block,/MEL_LAUNCH_BOOTSTRAP_TOKEN/);
  assert.doesNotMatch(block,/wrangler\s+(?:deploy|secret|versions)/);
});


test('decoupled Compétences proof binds live capabilities, verified skills, XP and browser rendering to exact SHA', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/release-downstream-proof-decoupled.yml',import.meta.url),'utf8');
  const block=workflow.split('\n  skills:\n')[1]?.split('\n  browser:\n')[0]||'';
  assert.match(block,/api\/gen2\/code\/self-check/);
  assert.match(block,/SKILLS_SHA_READY=0/);
  assert.match(block,/Compétences exact-SHA identity still propagating/);
  assert.match(block,/000\\|200\\|401\\|408\\|409\\|429\\|500\\|502\\|503\\|504/);
  assert.match(block,/"id":"skill\.list"/);
  assert.match(block,/"active_only":true/);
  assert.match(block,/api\/learning\/progress/);
  assert.match(block,/verified_active_count/);
  assert.match(block,/xp_source/);
  assert.match(block,/\/professor\?view=skills/);
  assert.match(block,/#skillsLearningState/);
  assert.match(block,/#skillsLearned/);
  assert.match(block,/#skillsXp/);
  assert.match(block,/SKILLS_BROWSER_READY=0/);
  assert.match(block,/max_steps:7/);
  assert.match(block,/timeout_ms:20000/);
  assert.match(block,/Compétences atomic browser proof not ready/);
  assert.match(block,/000\|400\|401\|403\|404\|408\|409\|429\|500\|502\|503\|504/);
  assert.match(block,/steps_completed\|\|0\)===7/);
  assert.doesNotMatch(block,/without navigation/);
  assert.match(block,/skills-control-center-production-proof\/v1/);
  assert.match(block,/secret_values_exposed:false/);
  assert.doesNotMatch(block,/MEL_LAUNCH_BOOTSTRAP_TOKEN/);
  assert.doesNotMatch(block,/wrangler\s+(?:deploy|secret|versions)/);

  const security=await readFile(new URL('../../src/core/security.js',import.meta.url),'utf8');
  const parallel=security.split('const PARALLEL_PROOF_ALLOWLIST')[1]?.split('export function isReleaseSmokeRequest')[0]||'';
  assert.match(parallel,/api\/learning\/progress/);
  assert.equal([...parallel.matchAll(/'([^']+)'/g)].some(([,route])=>route.includes('/learning/')&&route!=='/api/learning/progress'),false);
});


test('all decoupled downstream proofs wait behind one stable exact-SHA readiness gate', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/release-downstream-proof-decoupled.yml',import.meta.url),'utf8');
  const readiness=workflow.split('\n  readiness:\n')[1]?.split('\n  http:\n')[0]||'';
  assert.match(readiness,/timeout-minutes:\s*8/);
  assert.match(readiness,/DEADLINE_EPOCH=\$\(\( \$\(date \+%s\) \+ 360 \)\)/);
  assert.match(readiness,/while \[ "\$\{READY\}" != "1" \] && \[ "\$\(date \+%s\)" -lt "\$\{DEADLINE_EPOCH\}" \]/);
  assert.match(readiness,/RELEASE_IDENTITY_VERIFIED/);
  assert.match(readiness,/Downstream exact-SHA readiness did not stabilize within 360 seconds/);
  for (const job of ['http','capabilities','skills','browser','file','sovereignty']) {
    const block=workflow.split('\n  '+job+':\n')[1]?.split(/\n  [a-z][a-z0-9_-]*:\n/)[0]||'';
    assert.match(block,/^    needs: readiness$/m,job+' must wait for readiness');
  }
});

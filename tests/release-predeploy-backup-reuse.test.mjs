import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('canonical release proves a recent restore-verified backup through the ephemeral binder before deploy', async () => {
  const source = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  const start = source.indexOf('      - name: Create verified pre-deploy production backup');
  const end = source.indexOf('      - name: Prepare encrypted Media Vault secrets for exact deployment', start);
  const block = source.slice(start, end);
  assert.match(block, /mel-pdb-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}/);
  assert.match(block, /\/health/);
  assert.match(block, /BINDER_STABLE_PROBES/);
  assert.match(block, /\/prepare/);
  assert.match(block, /restore_candidate_verified/);
  assert.match(block, /backup_object_present/);
  assert.match(block, /backup_object_bytes/);
  assert.match(block, /snapshot_deployed_sha/);
  assert.match(block, /integrity_sha256/);
  assert.match(block, /predeploy-backup-verified\.marker/);
  assert.doesNotMatch(block, /release-launch-bootstrap/);
  assert.doesNotMatch(block, /MEL_LAUNCH_BOOTSTRAP_TOKEN/);
});

test('post-release proof suite is a direct release health gate and calls platform proof first', async () => {
  const deploy = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  const suite = await readFile(new URL('../.github/workflows/post-release-proof-suite.yml', import.meta.url), 'utf8');
  const platform = await readFile(new URL('../.github/workflows/activate-platform-capabilities.yml', import.meta.url), 'utf8');
  assert.match(suite, /workflow_call:/);
  assert.doesNotMatch(suite, /workflow_run:/);
  assert.match(deploy, /post-release-health:\n[\s\S]*needs:\s*deploy[\s\S]*uses:\s*\.\/\.github\/workflows\/post-release-proof-suite\.yml/);
  assert.match(suite, /platform:\n[\s\S]*uses: \.\/\.github\/workflows\/activate-platform-capabilities\.yml/);
  assert.match(platform, /workflow_call:/);
  assert.doesNotMatch(platform, /workflows: \["deploy-cloudflare-release"\]/);
  assert.match(platform, /cloudflare\.workers\.read/);
  assert.match(platform, /cloudflare\.deployments\.read/);
  assert.match(platform, /cloudflare\.deployments\.create/);
  assert.match(platform, /github\.actions\.workflow\.dispatch/);
  assert.match(platform, /secrets\.MEL_GITHUB_TOKEN \|\| secrets\.GITHUB_PAT \|\| secrets\.GH_PAT \|\| secrets\.GH_TOKEN/);
  assert.doesNotMatch(platform, /secrets\.GITHUB_TOKEN/);
});


test('canonical release waits on bounded ShardVault progress instead of a fixed blind retry count', async () => {
  const source = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  assert.match(source, /CODE_SYNC_MAX_ACTIVE_ATTEMPTS=32/);
  assert.match(source, /CODE_SYNC_MAX_STALL=12/);
  assert.match(source, /CODE_SYNC_LAST_COMPLETED=-1/);
  assert.match(source, /CODE_SYNC_DEADLINE_EPOCH=\$\(\( \$\(date \+%s\) \+ 1200 \)\)/);
  assert.match(source, /futureRetryAt=failuresList/);
  assert.match(source, /CODE_SYNC_NEXT_RETRY/);
  assert.match(source, /CODE_SYNC_WAITING_FOR_RETRY=1/);
  assert.match(source, /no active-attempt or no-progress budget is consumed/);
  assert.match(source, /Launch code-sync stopped after bounded no-progress window/);
  assert.match(source, /PRODUCTION_CODE_SYNC_FINAL_NOT_COMPLETE/);
  assert.match(source, /PRODUCTION_CODE_SYNC_FINAL_NOT_RELEASE_SAFE/);
  assert.match(source, /PRODUCTION_CODE_SYNC_TARGET_LT_7/);
  assert.match(source, /PRODUCTION_CODE_SYNC_SUCCESSFUL_ENDPOINTS_LT_RELEASE_QUORUM/);
  assert.match(source, /PRODUCTION_CODE_SYNC_QUORUM_RECONSTRUCTION_NOT_VERIFIED/);
  assert.match(source, /PRODUCTION_CODE_SYNC_ROUNDTRIP_NOT_VERIFIED/);
  assert.match(source, /exit 48/);
  assert.doesNotMatch(source, /for CODE_SYNC_ATTEMPT in \$\(seq 1 12\)/);
});


test('exact production deploy synchronizes the canonical backup encryption key identity', async () => {
  const source = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  const prepare = source.indexOf('      - name: Prepare encrypted Media Vault secrets for exact deployment');
  const deploy = source.indexOf('      - name: Deploy exact approved SHA to production', prepare);
  const block = source.slice(prepare, deploy);
  assert.ok(prepare >= 0 && deploy > prepare, 'release crypto preparation must precede exact deploy');
  assert.match(block, /MEL_BACKUP_ENCRYPTION_KEY_B64:String\(process\.env\.MEL_BACKUP_ENCRYPTION_KEY_B64/);
  assert.match(block, /MEL_BACKUP_ENCRYPTION_KEY_ID:String\(process\.env\.MEL_BACKUP_ENCRYPTION_KEY_ID/);
  assert.match(block, /RELEASE_CRYPTO_SECRETS_MISSING/);
  assert.match(source.slice(deploy, source.indexOf('      - name: Refresh production Workers AI zero-cost proof', deploy)), /--secrets-file media-vault-release-secrets\.json/);
});

test('Workers AI zero-cost proof is bundled into the exact immutable production deploy before autonomy proof', async () => {
  const source = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  const prepare = source.indexOf('      - name: Prepare encrypted Media Vault secrets for exact deployment');
  const deploy = source.indexOf('      - name: Deploy exact approved SHA to production', prepare);
  const verify = source.indexOf('      - name: Verify bundled Workers AI zero-cost proof', deploy);
  const autonomy = source.indexOf('      - name: Prepare and prove production autonomy launch evidence', verify);
  assert.ok(prepare >= 0 && deploy > prepare && verify > deploy && autonomy > verify, 'release markers must exist in immutable-deploy order');
  const prepareBlock = source.slice(prepare, deploy);
  assert.match(prepareBlock, /MEL_WORKERS_AI_ZERO_COST_PROOF_JSON:JSON\.stringify\(workersAiProof\)/);
  assert.match(prepareBlock, /workers-ai-zero-cost-proof\.json/);
  const deployBlock = source.slice(deploy, verify);
  assert.match(deployBlock, /--secrets-file media-vault-release-secrets\.json/);
  const verifyBlock = source.slice(verify, autonomy);
  assert.match(verifyBlock, /Workers AI \+ Browser Run zero-cost proofs bundled in the exact Worker deployment and still fresh/);
  assert.doesNotMatch(source.slice(deploy, autonomy), /wrangler secret put MEL_WORKERS_AI_ZERO_COST_PROOF_JSON/);
});


test('predeploy refresh creates the backup on the GitHub runner and keeps the Worker sidecar lightweight', async () => {
  const [source, refresher, runner] = await Promise.all([
    readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8'),
    readFile(new URL('../release-tools/predeploy-backup-refresh/worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../release-tools/predeploy-backup-refresh/runner.mjs', import.meta.url), 'utf8'),
  ]);
  const refresh = source.indexOf('      - name: Refresh current production backup through ephemeral worker');
  const rollback = source.indexOf('      - name: Capture current production rollback target');
  const binder = source.indexOf('      - name: Create verified pre-deploy production backup');
  assert.ok(refresh >= 0 && rollback > refresh && binder > rollback, 'runner backup refresh must complete before rollback capture and binder proof');

  const refreshBlock = source.slice(refresh, rollback);
  assert.match(refreshBlock, /mel-predeploy-backup-refresh/);
  assert.match(refreshBlock, /MEL_BACKUP_ENCRYPTION_KEY_B64: \$\{\{ secrets\.MEL_BACKUP_ENCRYPTION_KEY_B64 \}\}/);
  assert.match(refreshBlock, /MEL_BACKUP_ENCRYPTION_KEY_ID: \$\{\{ secrets\.MEL_BACKUP_ENCRYPTION_KEY_ID \}\}/);
  assert.match(refreshBlock, /CURRENT_PRODUCTION_RELEASE_SHA_NOT_FOUND/);
  assert.match(refreshBlock, /wrangler deploy --config/);
  assert.match(refreshBlock, /--var "MEL_PREDEPLOY_BACKUP_REFRESH_TOKEN:\$\{REFRESH_TOKEN\}"/);
  assert.doesNotMatch(refreshBlock, /wrangler secret put MEL_PREDEPLOY_BACKUP_REFRESH_TOKEN/);
  assert.doesNotMatch(refreshBlock, /wrangler secret put MEL_BACKUP_ENCRYPTION_KEY_B64/);
  assert.doesNotMatch(refreshBlock, /wrangler secret put MEL_BACKUP_ENCRYPTION_KEY_ID/);
  assert.doesNotMatch(refreshBlock, /MEL_D1_DATABASE_ID/);
  assert.match(refreshBlock, /MEL_R2_BUCKET_NAME/);
  assert.match(refreshBlock, /predeploy-backup-refresh\/runner\.mjs/);
  assert.match(refreshBlock, /\/workers\/scripts\/\$\{REFRESH_NAME\}/);
  assert.match(refreshBlock, /SIDECAR_READY=0/);
  assert.match(refreshBlock, /SIDECAR_STABLE_PROBES=0/);
  assert.match(refreshBlock, /stable probe/);
  assert.match(refreshBlock, /Ephemeral backup sidecar readiness attempt/);
  assert.match(refreshBlock, /seq 1 18/);
  assert.match(refreshBlock, /-ge 3/);
  assert.match(refreshBlock, /seq 1 5/);
  assert.match(refreshBlock, /cleanup failed; release remains blocked/);
  assert.match(refreshBlock, /exit 51/);
  assert.match(refreshBlock, /exit 52/);
  assert.doesNotMatch(refreshBlock, /MEL_LAUNCH_BOOTSTRAP_TOKEN/);
  assert.doesNotMatch(refreshBlock, /release-launch-bootstrap/);

  assert.match(refresher, /INVENTORY_PATH = '\/inventory'/);
  assert.match(refresher, /D1_TABLES_PATH = '\/d1\/tables'/);
  assert.match(refresher, /D1_ROWS_PATH = '\/d1\/rows'/);
  assert.match(refresher, /REGISTER_PATH = '\/register'/);
  assert.match(refresher, /MEDIA_BUCKET\.list/);
  assert.match(refresher, /env\.DB\.prepare/);
  assert.match(refresher, /INSERT INTO backup_objects/);
  assert.match(refresher, /R2_INVENTORY_PAGE/);
  assert.doesNotMatch(refresher, /runScheduledSystemBackup/);
  assert.doesNotMatch(refresher, /MEL_BACKUP_ENCRYPTION_KEY_B64/);

  assert.match(runner, /createVerifiedBackupService/);
  assert.match(runner, /createBackupEncryptionCodec/);
  assert.match(runner, /inspectRestoreCandidate/);
  assert.match(runner, /attempts = 12/);
  assert.match(runner, /Math\.min\(2000, 500 \* attempt\)/);
  assert.match(runner, /'\/d1\/tables'/);
  assert.match(runner, /\/d1\/rows/);
  assert.match(runner, /'\/register'/);
  assert.doesNotMatch(runner, /\/d1\/database\//);
  assert.match(runner, /'r2', 'object', 'put'/);
  assert.match(runner, /'r2', 'object', 'get'/);
  assert.match(runner, /PREDEPLOY_BACKUP_REFRESH_CREATED/);

  const binderEnd = source.indexOf('      - name: Prepare encrypted Media Vault secrets for exact deployment', binder);
  const binderBlock = source.slice(binder, binderEnd);
  assert.match(binderBlock, /mel-pdb-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}/);
  assert.match(binderBlock, /\/health/);
  assert.match(binderBlock, /BINDER_STABLE_PROBES/);
  assert.match(binderBlock, /\/prepare/);
  assert.match(binderBlock, /predeploy-backup-verified\.marker/);
  assert.match(binderBlock, /--var "MEL_PREDEPLOY_BINDER_TOKEN:\$\{BINDER_TOKEN\}"/);
  assert.doesNotMatch(binderBlock, /wrangler secret put MEL_PREDEPLOY_BINDER_TOKEN/);
  assert.doesNotMatch(binderBlock, /MEL_LAUNCH_BOOTSTRAP_TOKEN/);
  assert.doesNotMatch(binderBlock, /release-launch-bootstrap/);
});

test('canonical hardening release keeps MAX disabled unless an explicit workflow_dispatch opt-in requests it', async () => {
  const source = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  assert.match(source, /OWNER_MAX_AUTORELEASE: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.owner_max_autorelease && 'true' \|\| 'false' \}\}/);
  const browser = source.indexOf('      - name: Prove real production browser.execute');
  const safeStop = source.indexOf('      - name: Keep MAX disabled after hardening release');
  const max = source.indexOf('      - name: Re-enable MAX 100% after verified autonomous release');
  assert.ok(browser >= 0 && safeStop > browser && max > safeStop, 'safe-stop must run after live proofs and before any optional MAX re-enable');
  assert.match(source, /if: success\(\) && env\.OWNER_MAX_AUTORELEASE != 'true'/);
  assert.match(source, /paused=true, max_autonomy=false/);
  assert.match(source, /if: success\(\) && env\.OWNER_MAX_AUTORELEASE == 'true'/);
});


test('automatic rollback stages a fail-safe paused state before restoring the older Worker and verifies shared D1 after propagation', async () => {
  const source = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  const start = source.indexOf('      - name: Automatic rollback on failed production verification');
  const block = source.slice(start);
  const preRestore = block.indexOf('restore_sha=${PREVIOUS_DEPLOYED_SHA}');
  const cloudflareRollback = block.indexOf('npx wrangler rollback');
  const postControl = block.indexOf('/api/gen2/autonomy/control');
  assert.ok(preRestore >= 0 && cloudflareRollback > preRestore && postControl > cloudflareRollback);
  assert.match(block, /expected_sha=\$\{EXPECTED_SHA\}/);
  assert.match(block, /PRE_RESTORE_READY=0/);
  assert.match(block, /Safe paused autonomy staged in shared D1 before Worker rollback/);
  assert.match(block, /npx wrangler rollback "\$\{PREVIOUS_CLOUDFLARE_VERSION_ID\}"/);
  assert.match(block, /--name meliturgos/);
  assert.match(block, /Automatic Wrangler rollback failed/);
  assert.match(block, /\/tmp\/mel-rollback\.log/);
  assert.doesNotMatch(block, /deployments\?force=true/);
  assert.match(block, /exit 49/);
  assert.match(block, /exit 56/);
  assert.match(block, /exit 57/);
});

test('durable production reads absorb transient transport resets with bounded retries', async () => {
  const source = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  const start = source.indexOf('          for DURABLE_CAPABILITY in timeline.list project.list event.list; do');
  const end = source.indexOf("          node - <<'NODE'", start);
  const block = source.slice(start, end);
  assert.match(block, /for DURABLE_ATTEMPT in 1 2 3/);
  assert.match(block, /capabilities\/execute" \|\| true/);
  assert.match(block, /bounded retry/);
  assert.match(block, /after bounded retries/);
});


test('browser live proof uses MEL-owned deterministic public content', async () => {
  const source = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  const start = source.indexOf('      - name: Prove real production browser.execute');
  const end = source.indexOf('      - name: Re-enable MAX 100% after verified autonomous release', start);
  const block = source.slice(start, end);
  assert.match(block, /https:\/\/meliturgos\.adrien-lopezcarreras\.workers\.dev\/about/);
  assert.match(block, /Assistant personnel connecté/);
  assert.match(block, /navigate-mel-about/);
  assert.match(block, /read-mel-about/);
  assert.doesNotMatch(block, /https:\/\/example\.com/);
  assert.doesNotMatch(block, /Example Domain/);
});

test('canonical release accepts Teacher-proven progress while keeping blocked backlog observable', async () => {
  const source = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  const start = source.indexOf("const d=require('./production-capability-watch-proof.json')");
  const end = source.indexOf("console.log('GEN2-42 production Teacher handoff proof passed", start);
  const block = source.slice(start, end);
  assert.ok(start >= 0 && end > start, 'GEN2-42 workflow proof contract must exist');
  assert.match(block, /teacherProvenCount>=1/);
  assert.match(block, /blockedCount>=0/);
  assert.match(block, /teacherProvenCount\+blockedCount===openCount/);
  assert.doesNotMatch(block, /teacher_proven_handoff_count\|\|0\)===Number\(d\?\.open_handoff_count/);
  assert.doesNotMatch(block, /blocked_open_handoff_count\|\|0\)===0/);
});

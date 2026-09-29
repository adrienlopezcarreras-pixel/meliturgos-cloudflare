import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('canonical release proves a recent restore-verified backup through the ephemeral binder before deploy', async () => {
  const source = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  const start = source.indexOf('      - name: Create verified pre-deploy production backup');
  const end = source.indexOf('      - name: Install pinned Browser Rendering adapter', start);
  const block = source.slice(start, end);
  assert.match(block, /mel-predeploy-backup-binder/);
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

test('real platform capability proof runs automatically after a successful canonical release', async () => {
  const source = await readFile(new URL('../.github/workflows/activate-platform-capabilities.yml', import.meta.url), 'utf8');
  assert.match(source, /workflows: \["deploy-cloudflare-release"\]/);
  assert.match(source, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.doesNotMatch(source, /github\.event\.workflow_run\.head_branch == 'release\/mel-hardware-v0\.1\.0'/);
  assert.match(source, /cloudflare\.workers\.read/);
  assert.match(source, /cloudflare\.deployments\.read/);
  assert.match(source, /cloudflare\.deployments\.create/);
  assert.match(source, /github\.actions\.workflow\.dispatch/);
  assert.match(source, /secrets\.MEL_GITHUB_TOKEN \|\| secrets\.GITHUB_PAT \|\| secrets\.GH_PAT \|\| secrets\.GH_TOKEN/);
  assert.doesNotMatch(source, /secrets\.GITHUB_TOKEN/);
});


test('canonical release waits on bounded ShardVault progress instead of a fixed blind retry count', async () => {
  const source = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  assert.match(source, /CODE_SYNC_MAX_ATTEMPTS=32/);
  assert.match(source, /CODE_SYNC_MAX_STALL=12/);
  assert.match(source, /CODE_SYNC_LAST_COMPLETED=-1/);
  assert.match(source, /CODE_SYNC_STATUS" = "RETRY_TARGETS"/);
  assert.match(source, /CODE_SYNC_NEXT_RETRY/);
  assert.match(source, /Launch code-sync stopped after bounded no-progress window/);
  assert.match(source, /PRODUCTION_CODE_SYNC_FINAL_NOT_COMPLETE/);
  assert.match(source, /PRODUCTION_CODE_SYNC_FINAL_NOT_COPIED/);
  assert.match(source, /PRODUCTION_CODE_SYNC_TARGET_LT_7/);
  assert.match(source, /PRODUCTION_CODE_SYNC_SUCCESSFUL_ENDPOINTS_LT_7/);
  assert.match(source, /PRODUCTION_CODE_SYNC_ROUNDTRIP_NOT_VERIFIED/);
  assert.match(source, /exit 48/);
  assert.doesNotMatch(source, /for CODE_SYNC_ATTEMPT in \$\(seq 1 12\)/);
});


test('Workers AI zero-cost proof refresh runs after exact production deploy and before autonomy proof', async () => {
  const source = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  const deploy = source.indexOf('      - name: Deploy exact approved SHA to production');
  const proof = source.indexOf('      - name: Refresh production Workers AI zero-cost proof');
  const autonomy = source.indexOf('      - name: Prepare and prove production autonomy launch evidence');
  assert.ok(deploy >= 0 && proof >= 0 && autonomy >= 0, 'release markers must exist');
  assert.ok(deploy < proof, 'Workers AI proof refresh must happen only after the exact production SHA is deployed');
  assert.ok(proof < autonomy, 'Workers AI zero-cost proof must be refreshed before autonomy live proofs begin');
  assert.match(source, /wrangler secret put MEL_WORKERS_AI_ZERO_COST_PROOF_JSON/);
});


test('predeploy refresh creates a fresh production backup before rollback capture and removes its temporary secret', async () => {
  const source = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  const refresh = source.indexOf('      - name: Refresh current production backup before release gate');
  const rollback = source.indexOf('      - name: Capture current production rollback target');
  const binder = source.indexOf('      - name: Create verified pre-deploy production backup');
  assert.ok(refresh >= 0 && rollback > refresh && binder > rollback, 'backup refresh must complete before rollback capture and binder proof');

  const refreshBlock = source.slice(refresh, rollback);
  assert.match(refreshBlock, /release-launch-bootstrap/);
  assert.match(refreshBlock, /'\{"phase":"backup"\}'/);
  assert.match(refreshBlock, /wrangler secret put MEL_LAUNCH_BOOTSTRAP_TOKEN/);
  assert.match(refreshBlock, /wrangler secret delete MEL_LAUNCH_BOOTSTRAP_TOKEN/);
  assert.match(refreshBlock, /seq 1 12/);
  assert.match(refreshBlock, /seq 1 5/);
  assert.match(refreshBlock, /REFRESH_SECRET_INSTALLED=0/);
  assert.match(refreshBlock, /cleanup failed; release remains blocked/);
  assert.match(refreshBlock, /exit 51/);
  assert.match(refreshBlock, /d\?\.ok!==true/);
  assert.match(refreshBlock, /b\?\.ok!==true\|\|!b\?\.id/);

  const binderEnd = source.indexOf('      - name: Install pinned Browser Rendering adapter', binder);
  const binderBlock = source.slice(binder, binderEnd);
  assert.match(binderBlock, /mel-predeploy-backup-binder/);
  assert.match(binderBlock, /\/prepare/);
  assert.match(binderBlock, /predeploy-backup-verified\.marker/);
  assert.doesNotMatch(binderBlock, /MEL_LAUNCH_BOOTSTRAP_TOKEN/);
  assert.doesNotMatch(binderBlock, /release-launch-bootstrap/);
});


test('canonical release push restores MAX autonomy after live proofs', async () => {
  const source = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  assert.match(source, /OWNER_MAX_AUTORELEASE: \$\{\{ github\.event_name == 'push' && 'true'/);
  const browser = source.indexOf('      - name: Prove real production browser.execute');
  const max = source.indexOf('      - name: Re-enable MAX 100% after verified autonomous release');
  assert.ok(browser >= 0 && max > browser, 'MAX autonomy must only resume after browser.execute live proof');
  assert.match(source, /if: success\(\) && env\.OWNER_MAX_AUTORELEASE == 'true'/);
  assert.match(source, /MAX 100% restored after verified release/);
});


test('automatic rollback forces older version restore after secret changes and surfaces Cloudflare errors', async () => {
  const source = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  const start = source.indexOf('      - name: Automatic rollback on failed production verification');
  const block = source.slice(start);
  assert.match(block, /deployments\?force=true/);
  assert.match(block, /Automatic rollback returned HTTP/);
  assert.match(block, /cat rollback-response\.json/);
  assert.match(block, /d\?\.success!==true/);
  assert.match(block, /exit 49/);
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('canonical release reuses an exact verified restore proof before heavy backup work', async () => {
  const source = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  assert.match(source, /REUSED_EXISTING_VERIFIED_RESTORE_PROOF/);
  assert.match(source, /--data '\{"phase":"readiness"\}'/);
  assert.match(source, /r\?\.ok!==true \|\| r\?\.sha_matches!==true \|\| !r\?\.snapshot_id/);
  assert.match(source, /if \[ "\$BACKUP_READY" != "1" \]; then/);
  assert.match(source, /--data '\{"phase":"backup"\}'/);
  assert.match(source, /predeploy-backup-verified\.marker/);
});

test('predeploy backup binding uses a temporary D1-bound Worker and always cleans it up', async () => {
  const source = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  assert.match(source, /mel-predeploy-binder-\$\{GITHUB_RUN_ID\}/);
  assert.match(source, /scripts\/predeploy-release-binder-worker\.js/);
  assert.match(source, /wrangler deploy --config predeploy-binder-wrangler\.jsonc/);
  assert.match(source, /wrangler secret put PREDEPLOY_BIND_TOKEN --config predeploy-binder-wrangler\.jsonc/);
  assert.match(source, /workers\/scripts\/\$\{BINDER_NAME\}/);
  assert.match(source, /trap cleanup_predeploy_resources EXIT/);
  assert.match(source, /RELEASE_BACKUP_BOUND/);
  assert.doesNotMatch(source, /\/d1\/database\/\$\{D1_DATABASE_ID\}\/query/);
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

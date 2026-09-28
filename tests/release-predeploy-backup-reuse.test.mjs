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

test('real platform capability proof runs automatically after a successful canonical release', async () => {
  const source = await readFile(new URL('../.github/workflows/activate-platform-capabilities.yml', import.meta.url), 'utf8');
  assert.match(source, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(source, /github\.event\.workflow_run\.head_branch == 'release\/mel-hardware-v0\.1\.0'/);
  assert.match(source, /cloudflare\.workers\.read/);
  assert.match(source, /cloudflare\.deployments\.read/);
  assert.match(source, /cloudflare\.deployments\.create/);
  assert.match(source, /github\.actions\.workflow\.dispatch/);
});

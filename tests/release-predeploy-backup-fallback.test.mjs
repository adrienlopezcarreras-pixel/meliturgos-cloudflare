import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('release backup fails over to a real D1 export with R2 round-trip verification', async () => {
  const source = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  assert.match(source, /Create verified pre-deploy production backup/);
  assert.match(source, /--max-time 60/);
  assert.match(source, /wrangler d1 export meliturgos-memory --remote --output=predeploy-d1\.sql/);
  assert.match(source, /wrangler r2 object put "\$\{D1_OBJECT\}"/);
  assert.match(source, /wrangler r2 object get "\$\{D1_OBJECT\}"/);
  assert.match(source, /cmp -s predeploy-d1\.sql predeploy-d1-roundtrip\.sql/);
  assert.match(source, /sha256sum predeploy-d1\.sql/);
  assert.match(source, /roundtrip_verified:true/);
  assert.match(source, /predeploy-backup-verified\.marker/);
  assert.match(source, /PREDEPLOY_BACKUP_MODE/);
});

test('real platform capability proof follows every successful canonical release', async () => {
  const source = await readFile(new URL('../.github/workflows/activate-platform-capabilities.yml', import.meta.url), 'utf8');
  assert.match(source, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(source, /github\.event\.workflow_run\.head_branch == 'release\/mel-hardware-v0\.1\.0'/);
  assert.match(source, /cloudflare\.workers\.read/);
  assert.match(source, /cloudflare\.deployments\.read/);
  assert.match(source, /cloudflare\.deployments\.create/);
  assert.match(source, /github\.actions\.workflow\.dispatch/);
});

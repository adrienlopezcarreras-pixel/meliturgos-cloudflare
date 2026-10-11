import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('release backup sidecar uses a unique Worker name per workflow run and attempt', async () => {
  const source = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  assert.match(source, /REFRESH_NAME="mel-pd-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}"/);
  assert.match(source, /wrangler\.run\.jsonc/);
  assert.match(source, /config\.name=process\.env\.REFRESH_NAME/);
  assert.match(source, /REFRESH_URL="https:\/\/\$\{REFRESH_NAME\}\.adrien-lopezcarreras\.workers\.dev"/);
  assert.match(source, /--var "MEL_PREDEPLOY_BACKUP_REFRESH_TOKEN:\$\{REFRESH_TOKEN\}"/);
  assert.doesNotMatch(source, /wrangler secret put MEL_PREDEPLOY_BACKUP_REFRESH_TOKEN/);
  assert.doesNotMatch(source, /REFRESH_NAME="mel-predeploy-backup-refresh"/);
});


test('release backup binder uses a unique Worker name and authenticated stable readiness probes', async () => {
  const source = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  assert.match(source, /BINDER_NAME="mel-pdb-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}"/);
  assert.match(source, /predeploy-backup-binder\/wrangler\.run\.jsonc/);
  assert.match(source, /config\.name=process\.env\.BINDER_NAME/);
  assert.match(source, /BINDER_URL="https:\/\/\$\{BINDER_NAME\}\.adrien-lopezcarreras\.workers\.dev"/);
  assert.match(source, /BINDER_READY=0/);
  assert.match(source, /BINDER_STABLE_PROBES=0/);
  const binderStart = source.indexOf('      - name: Create verified pre-deploy production backup');
  const binderEnd = source.indexOf('      - name: Prepare encrypted Media Vault secrets for exact deployment', binderStart);
  const binderBlock = source.slice(binderStart, binderEnd);
  assert.match(binderBlock, /--var "MEL_PREDEPLOY_BINDER_TOKEN:\$\{BINDER_TOKEN\}"/);
  assert.doesNotMatch(binderBlock, /wrangler secret put MEL_PREDEPLOY_BINDER_TOKEN/);
  assert.match(source, /\/health/);
  assert.match(source, /Ephemeral backup binder stable probe/);
  assert.match(source, /seq 1 24/);
  assert.match(source, /-ge 3/);
  assert.doesNotMatch(source, /BINDER_NAME="mel-predeploy-backup-binder"/);
});

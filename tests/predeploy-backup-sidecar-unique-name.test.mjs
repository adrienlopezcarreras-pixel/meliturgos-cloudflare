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

test('Cloudflare 1042 retries stay bounded and never bypass encrypted backup or MAX pause verification', async () => {
  const source = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  const start = source.indexOf('      - name: Create verified pre-deploy production backup');
  const end = source.indexOf('      - name: Prepare encrypted Media Vault secrets for exact deployment', start);
  assert.ok(start >= 0 && end > start, 'predeploy backup gate must precede deployment');
  const binder = source.slice(start, end);
  assert.match(binder, /for ATTEMPT in \$\(seq 1 20\); do/);
  assert.match(binder, /--request POST/);
  assert.match(binder, /\$\{BINDER_URL\}\/prepare/);
  assert.match(binder, /\[ "\$\{CODE\}" = "200" \] && node - <<'NODE'/);
  assert.match(binder, /d\?\.ok!==true\|\|d\?\.status!=='PREDEPLOY_RELEASE_PREPARED'/);
  assert.match(binder, /d\?\.autonomy\?\.paused!==true\|\|d\?\.autonomy\?\.status!=='PAUSED'/);
  assert.match(binder, /b\?\.restore_candidate_verified!==true/);
  assert.match(binder, /b\?\.backup_object_present!==true/);
  assert.match(binder, /b\?\.integrity_sha256/);
  assert.match(binder, /b\?\.snapshot_deployed_sha/);
  assert.match(binder, /if \[ "\$\{CODE\}" = "409" \] \|\| \[ "\$\{CODE\}" = "401" \] \|\| \[ "\$\{CODE\}" = "403" \]/);
  assert.match(binder, /grep -Eiq 'error code:\[\[:space:\]\]\*1042'/);
  assert.match(binder, /Unexpected binder HTTP 404 without Cloudflare edge 1042/);
  assert.match(binder, /if \[ "\$\{PREPARED\}" != "1" \]; then\s+exit 54/);
  assert.match(binder, /predeploy-backup-verified\.marker/);
  assert.ok(source.indexOf('      - name: Deploy exact approved SHA to production') > end);
  assert.doesNotMatch(binder, /SKIP_BACKUP|ALLOW_UNVERIFIED_BACKUP|DISABLE_ROLLBACK/);
});

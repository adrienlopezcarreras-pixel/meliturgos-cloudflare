import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('release backup sidecar uses a unique Worker name per workflow run and attempt', async () => {
  const source = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  assert.match(source, /REFRESH_NAME="mel-pd-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}"/);
  assert.match(source, /wrangler\.run\.jsonc/);
  assert.match(source, /config\.name=process\.env\.REFRESH_NAME/);
  assert.match(source, /REFRESH_URL="https:\/\/\$\{REFRESH_NAME\}\.adrien-lopezcarreras\.workers\.dev"/);
  assert.doesNotMatch(source, /REFRESH_NAME="mel-predeploy-backup-refresh"/);
});

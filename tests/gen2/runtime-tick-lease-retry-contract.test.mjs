import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('GEN2-42 tick uses GitHub Actions OIDC and no Cloudflare D1/R2 or Worker secret mutation', async () => {
  const source = await readFile(new URL('../../.github/workflows/gen2-42-runtime-tick.yml', import.meta.url), 'utf8');
  assert.match(source, /id-token:\s*write/);
  assert.match(source, /ACTIONS_ID_TOKEN_REQUEST_URL/);
  assert.match(source, /audience=meliturgos-worker/);
  assert.match(source, /x-mel-github-oidc: \$OIDC_TOKEN/);
  assert.doesNotMatch(source, /create-gen2-42-bootstrap-challenge\.mjs/);
  assert.doesNotMatch(source, /CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(source, /CLOUDFLARE_ACCOUNT_ID/);
  assert.doesNotMatch(source, /MEL_R2_BUCKET/);
  assert.doesNotMatch(source, /wrangler secret put MEL_GEN2_42_BOOTSTRAP_TOKEN/);
});

test('GEN2-42 production tick shares the release-proof concurrency group and never cancels active stress', async () => {
  const source = await readFile(new URL('../../.github/workflows/gen2-42-runtime-tick.yml', import.meta.url), 'utf8');
  assert.match(source, /concurrency:\s*\n\s+group:.*'mel-launch-bootstrap-token'/);
  assert.match(source, /cancel-in-progress:\s*false/);
  assert.match(source, /SKIPPED_LEASE_BUSY/);
});

test('GEN2-42 records lease contention without inventing progress or recursively dispatching', async () => {
  const source = await readFile(new URL('../../.github/workflows/gen2-42-runtime-tick.yml', import.meta.url), 'utf8');
  assert.match(source, /AUTONOMY_LEASE_CONTENTION_DEFERRED/);
  assert.doesNotMatch(source, /AUTONOMY_LEASE_BUSY_AFTER_RETRIES/);
  assert.match(source, /if \[ "\$BLOCK" = "AUTONOMY_RUNTIME_LEASE_BUSY" \]; then\s+echo "AUTONOMY_CHAIN_DEFERRED_LEASE_BUSY"\s+exit 0/);
  assert.match(source, /tick_status:body\?\.tick_status\|\|null/);
  assert.match(source, /advanced:body\?\.advanced===true/);
});

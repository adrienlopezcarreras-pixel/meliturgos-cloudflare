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

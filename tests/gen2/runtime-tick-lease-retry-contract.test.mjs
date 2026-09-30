import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('GEN2-42 tick uses a Wrangler-provisioned one-shot D1 challenge and no R2 or Worker secret mutation', async () => {
  const source = await readFile(new URL('../../.github/workflows/gen2-42-runtime-tick.yml', import.meta.url), 'utf8');
  assert.match(source, /create-gen2-42-bootstrap-challenge\.mjs/);
  assert.match(source, /x-mel-gen2-42-bootstrap: \$BOOTSTRAP_TOKEN/);
  assert.match(source, /CLOUDFLARE_API_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(source, /CLOUDFLARE_ACCOUNT_ID:\s*\$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/);
  assert.doesNotMatch(source, /MEL_DEV_BRIDGE_TOKEN/);
  assert.doesNotMatch(source, /MEL_R2_BUCKET/);
  assert.doesNotMatch(source, /wrangler secret put MEL_GEN2_42_BOOTSTRAP_TOKEN/);
});

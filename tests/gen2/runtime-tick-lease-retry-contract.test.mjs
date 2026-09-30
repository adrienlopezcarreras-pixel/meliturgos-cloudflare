import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('GEN2-42 tick uses durable Dev Bridge auth and avoids R2/bootstrap-secret mutation', async () => {
  const source = await readFile(new URL('../../.github/workflows/gen2-42-runtime-tick.yml', import.meta.url), 'utf8');
  assert.match(source, /MEL_DEV_BRIDGE_TOKEN:\s*\$\{\{ secrets\.MEL_DEV_BRIDGE_TOKEN \}\}/);
  assert.match(source, /\/api\/dev-bridge\/autonomy\/tick/);
  assert.match(source, /Authorization: Bearer \$MEL_DEV_BRIDGE_TOKEN/);
  assert.doesNotMatch(source, /create-gen2-42-bootstrap-challenge\.mjs/);
  assert.doesNotMatch(source, /MEL_R2_BUCKET/);
  assert.doesNotMatch(source, /wrangler secret put MEL_GEN2_42_BOOTSTRAP_TOKEN/);
});

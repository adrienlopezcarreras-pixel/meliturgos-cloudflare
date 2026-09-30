import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('GEN2-42 tick uses one-shot D1 auth and treats a busy lease as a safe deferred retry', async () => {
  const source = await readFile(new URL('../../.github/workflows/gen2-42-runtime-tick.yml', import.meta.url), 'utf8');
  assert.match(source, /create-gen2-42-bootstrap-challenge\.mjs/);
  assert.match(source, /x-mel-gen2-42-bootstrap: \$BOOTSTRAP_TOKEN/);
  assert.match(source, /SKIPPED_LEASE_BUSY/);
  assert.match(source, /one-shot challenge consumed correctly/);
  assert.doesNotMatch(source, /lease busy on attempt \$ATTEMPT\/12/);
  assert.doesNotMatch(source, /wrangler secret put MEL_GEN2_42_BOOTSTRAP_TOKEN/);
});

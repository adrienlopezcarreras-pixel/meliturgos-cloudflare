import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('GEN2-42 tick retries boundedly when autonomy lease is busy', async () => {
  const source = await readFile(new URL('../../.github/workflows/gen2-42-runtime-tick.yml', import.meta.url), 'utf8');
  assert.match(source, /SKIPPED_LEASE_BUSY/);
  assert.match(source, /lease busy on attempt \$ATTEMPT\/12/);
  assert.match(source, /sleep 8/);
  assert.match(source, /continue/);
});

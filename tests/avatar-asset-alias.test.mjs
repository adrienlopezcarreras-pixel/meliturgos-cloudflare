import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

test('all MEL avatar aliases resolve to the real bundled Spanish avatar asset', async () => {
  const router = await readFile(new URL('../src/router.js', import.meta.url), 'utf8');
  await assert.doesNotReject(() => access(new URL('../assets/avatars/mel-spanish-20260911.webp', import.meta.url)));
  assert.match(router, /requestedPath\.startsWith\('\/avatars\/'\)/);
  assert.match(router, /\/avatars\/mel-spanish-20260911\.webp/);
  assert.match(router, /x-mel-asset-alias/);
  assert.match(router, /no-store, max-age=0/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('production Worker uses public global fetch routing for Cloudflare API subrequests', async () => {
  const source = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(source, /"compatibility_flags"\s*:\s*\[[^\]]*"global_fetch_strictly_public"[^\]]*\]/);
});


test('production Worker declares owner authentication as a required inherited secret', async () => {
  const source = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(source, /"secrets"\s*:\s*\{[\s\S]*"required"\s*:\s*\[[^\]]*"MELITURGOS_PASSWORD"[^\]]*\]/);
});

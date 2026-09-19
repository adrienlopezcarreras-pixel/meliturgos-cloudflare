import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('ShardVault keeps embedded discovery seeds and follows GitHub archive redirects', () => {
  const discovery=fs.readFileSync(new URL('../src/continuity/autonomous-repositories.js',import.meta.url),'utf8');
  assert.match(discovery,/EMBEDDED_SEED_LEADS/);
  assert.match(discovery,/FALLBACK_EMBEDDED/);
  assert.match(discovery,/awesome-file-hosts/);
  const runtime=fs.readFileSync(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8');
  assert.match(runtime,/api\.github\.com\/repos/);
  assert.match(runtime,/redirect:'follow'/);
  assert.match(runtime,/MEL-ShardVault\/0\.4/);
});

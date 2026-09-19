import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('ShardVault Internet fetch uses Cloudflare-compatible manual redirect handling', () => {
  const source=fs.readFileSync(new URL('../src/continuity/autonomous-repositories.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/redirect:'error'/);
  assert.match(source,/redirect:'manual'/);
  assert.match(source,/FETCH_REDIRECT/);
  assert.match(source,/REDIRECT_LIMIT/);
});

test('discovery generation metadata survives candidate loading', () => {
  const source=fs.readFileSync(new URL('../src/continuity/autonomous-repositories.js',import.meta.url),'utf8');
  assert.match(source,/generation:internet\.generation\|\|1/);
  assert.match(source,/known_leads:internet\.known_leads\|\|0/);
  assert.match(source,/new_leads:internet\.new_leads\|\|0/);
  assert.match(source,/query_set:internet\.query_set\|\|\[\]/);
});

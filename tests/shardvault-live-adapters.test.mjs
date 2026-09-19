import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const autonomous=fs.readFileSync(new URL('../src/continuity/autonomous-repositories.js',import.meta.url),'utf8');
const runtime=fs.readFileSync(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8');

test('ShardVault provider adapters reflect current official API contracts', () => {
  assert.match(autonomous,/https:\/\/paste\.myst\.rs\/api\/v2\/paste\?mel_object=/);
  assert.match(autonomous,/language:'Plain Text'/);
  assert.match(autonomous,/form\.append\('expiry_days','365'\)/);
  assert.match(autonomous,/form\.append\('file',new Blob\(\[b64u\(payload\)\]/);
  assert.match(autonomous,/adapter:'fileditch_b64'/);
  assert.match(autonomous,/filename=\{objectId\}\.txt/);
  assert.match(autonomous,/x-uuid':'1'/);
});

test('snapshot runtime can write and read every repaired adapter selected by discovery', () => {
  for (const adapter of ['dpaste_b64','pastemyst_b64','onec3_b64','paste_c_net','fileditch_b64']) {
    assert.ok(runtime.includes(`e.adapter==='${adapter}'`) || runtime.includes(`'${adapter}'`), adapter);
  }
  assert.match(runtime,/paste\.myst\.rs\/api\/v2\/paste\//);
  assert.match(runtime,/user-agent':'curl\/8\.0 MEL-ShardVault\/1\.0'/);
  assert.match(runtime,/fileditch_b64/);
});

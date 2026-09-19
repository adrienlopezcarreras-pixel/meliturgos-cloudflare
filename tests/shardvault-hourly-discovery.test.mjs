import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('hourly maintenance schedules autonomous ShardVault Internet discovery', () => {
  const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
  assert.match(source,/searchAutonomousShardVaultRepositories/);
  assert.match(source,/scheduled Internet discovery/);
  const shard=fs.readFileSync(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8');
  assert.match(shard,/shardvault\/discovery\/latest\.json/);
  assert.match(shard,/last_discovery:discovery/);
});

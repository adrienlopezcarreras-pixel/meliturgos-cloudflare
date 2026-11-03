import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHARD_MAP_DRIVE_NAME, parseShardMap, shardMapText } from '../src/continuity/embedded-shard-map.js';

test('the Drive shard map is the discovery index under a stable name', () => {
  const index = JSON.parse(readFileSync(new URL('../shardvault/discovery-index.json', import.meta.url), 'utf8'));
  const text = shardMapText();
  const map = parseShardMap(text);
  assert.equal(map.name, SHARD_MAP_DRIVE_NAME);
  assert.equal(map.name, 'MEL-SHARD-MAP.json');
  assert.equal(map.readable_without_github, true);
  assert.equal(map.readable_without_cloudflare, true);
  assert.deepEqual(map.index, index);
  assert.equal(text.includes('api_key'), false);
});

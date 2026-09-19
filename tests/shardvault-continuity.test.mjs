import assert from 'node:assert/strict';
import { __shardvaultTest } from '../src/continuity/shardvault-runtime.js';

const data = Array.from({ length: 4 }, (_, index) => {
  const value = new Uint8Array(257);
  value.fill(index + 1);
  return value;
});
const encoded = __shardvaultTest.encode(data, 7);
for (const missing of [[1], [1, 5], [0, 3, 6]]) {
  const partial = encoded.map((value, index) => missing.includes(index) ? null : value);
  const decoded = __shardvaultTest.decode(partial, 4, 7, 257);
  assert.deepEqual(decoded.map(x => [...x]), encoded.map(x => [...x]));
}

const endpoints = [
  { id:'a1', operatorDomain:'a.test', providerId:'a', jurisdiction:'FR', score:100, confidence:100 },
  { id:'a2', operatorDomain:'a.test', providerId:'a', jurisdiction:'FR', score:99, confidence:100 },
  { id:'b1', operatorDomain:'b.test', providerId:'b', jurisdiction:'DE', score:98, confidence:100 },
  { id:'c1', operatorDomain:'c.test', providerId:'c', jurisdiction:'NL', score:97, confidence:100 },
  { id:'d1', operatorDomain:'d.test', providerId:'d', jurisdiction:'ES', score:96, confidence:100 },
];
const selected = __shardvaultTest.selectEndpoints(endpoints, 4, 2, 2);
assert.deepEqual(selected.map(x => x.id), ['a1','b1','c1','d1']);
assert.equal(__shardvaultTest.diversity(selected).fallbackUsed, false);

console.log('ShardVault continuity tests: OK');

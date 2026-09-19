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


const activeBase = [
  { id:'a', operatorDomain:'a.test', providerId:'a' },
  { id:'b', operatorDomain:'b.test', providerId:'b' },
  { id:'c', operatorDomain:'c.test', providerId:'c' },
  { id:'d', operatorDomain:'d.test', providerId:'d' },
  { id:'e', operatorDomain:'e.test', providerId:'e' },
];
const activeSeven = __shardvaultTest.extendActiveEndpoints(activeBase,[
  { id:'f', operatorDomain:'f.test', providerId:'f' },
  { id:'g', operatorDomain:'g.test', providerId:'g' },
  { id:'h', operatorDomain:'h.test', providerId:'h' },
],7,2,2);
assert.deepEqual(activeSeven.map(x=>x.id),['a','b','c','d','e','f','g']);
const noSilentEviction = __shardvaultTest.extendActiveEndpoints(activeSeven,[
  { id:'h', operatorDomain:'h.test', providerId:'h' },
],7,2,2);
assert.deepEqual(noSilentEviction.map(x=>x.id),['a','b','c','d','e','f','g']);


const provenConfig = {
  n:7,
  allEndpoints:[
    {id:'p1',operatorDomain:'p1.test',providerId:'p1',expectedRetentionDays:365},
    {id:'p2',operatorDomain:'p2.test',providerId:'p2',expectedRetentionDays:365},
    {id:'p3',operatorDomain:'p3.test',providerId:'p3',expectedRetentionDays:365},
    {id:'internal',backend:'r2',operatorDomain:'cloudflare.com',providerId:'r2',expectedRetentionDays:365},
  ]
};
const proven = __shardvaultTest.externalEndpointsFromSnapshot({},provenConfig,{
  shards:[
    {endpointId:'p1'},
    {endpointId:'p2'},
    {endpointId:'internal'},
    {endpointId:'p3'},
  ]
});
assert.deepEqual(proven.map(x=>x.id),['p1','p2','p3']);

console.log('ShardVault continuity tests: OK');

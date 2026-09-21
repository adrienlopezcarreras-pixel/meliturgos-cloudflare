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


const rankedCodeTargets = __shardvaultTest.rankExternalCodeCandidates({}, [
  { id:'slow-small', operatorDomain:'slow.test', providerId:'slow', expectedRetentionDays:365, maxBytes:4096, probeLatencyMs:900, score:100 },
  { id:'fast-large', operatorDomain:'fast.test', providerId:'fast', expectedRetentionDays:365, maxBytes:1024*1024, probeLatencyMs:25, score:80, representativeBytes:256*1024, representativeSha256:'a'.repeat(64), representativeVerifiedAt:new Date().toISOString() },
  { id:'fast-large-2', operatorDomain:'fast2.test', providerId:'fast2', expectedRetentionDays:365, maxBytes:1024*1024, probeLatencyMs:30, score:79, representativeBytes:256*1024, representativeSha256:'b'.repeat(64), representativeVerifiedAt:new Date().toISOString() },
], 128*1024);
assert.deepEqual(rankedCodeTargets.map(x=>x.id), ['fast-large','fast-large-2']);
assert.equal(rankedCodeTargets.some(x=>x.id==='slow-small'), false);

const failoverItems = [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])];
const failoverCandidates = ['e1','e2','e3','e4'].map(id => ({
  id,
  operatorDomain:id+'.test',
  providerId:id,
  expectedRetentionDays:365,
}));
const failoverResult = await __shardvaultTest.assignDistinctExternalTargets(
  failoverItems,
  failoverCandidates,
  async (index, endpoint) => {
    if (endpoint.id === 'e2') throw new Error('SIMULATED_TARGET_FAILURE');
    return { index, endpointId:endpoint.id };
  },
);
assert.equal(failoverResult.ok, true);
assert.deepEqual(failoverResult.assignments.map(x=>x.endpointId), ['e1','e4','e3']);
assert.deepEqual(failoverResult.pending_indices, []);
assert.ok(failoverResult.failures.some(x=>x.endpoint_id==='e2'));
assert.deepEqual(failoverResult.attempted_endpoints, ['e1','e2','e3','e4']);

console.log('ShardVault continuity tests: OK');


const retryable503 = __shardvaultTest.codeTargetFailureClass(new Error('WRITE_target_503'));
assert.equal(retryable503.retryable, true);
assert.equal(retryable503.permanent, false);
const permanentShape = __shardvaultTest.codeTargetFailureClass(new Error('WRITE_target_REMOTE_URL_MISSING'));
assert.equal(permanentShape.retryable, false);
assert.equal(permanentShape.permanent, true);

const retryState = { attempted_endpoints:[], failed_endpoint_ids:[], endpoint_failures:{} };
const firstRetry = __shardvaultTest.recordCodeTargetFailure(
  retryState,
  {id:'retry-a'},
  new Error('CODE_FRAGMENT_DEADLINE_EXCEEDED'),
  1000
);
assert.equal(firstRetry.retryable, true);
assert.equal(retryState.failed_endpoint_ids.includes('retry-a'), false);
assert.equal(__shardvaultTest.codeTargetAvailableNow(retryState,{id:'retry-a'},1001), false);
assert.equal(__shardvaultTest.codeTargetAvailableNow(retryState,{id:'retry-a'},7000), true);
assert.equal(__shardvaultTest.codeTargetRetryDelayMs(1), 5000);
assert.equal(__shardvaultTest.codeTargetRetryDelayMs(8), 120000);

const permanentState = { attempted_endpoints:[], failed_endpoint_ids:[], endpoint_failures:{} };
const permanentFailure = __shardvaultTest.recordCodeTargetFailure(
  permanentState,
  {id:'bad-shape'},
  new Error('CODE_FRAGMENT_ROUNDTRIP_MISMATCH'),
  1000
);
assert.equal(permanentFailure.permanent, true);
assert.deepEqual(permanentState.failed_endpoint_ids,['bad-shape']);

const priorityState={attempted_endpoints:['old-a']};
const prioritized=__shardvaultTest.prioritizeExternalCodeCandidates(
  [{id:'old-a'},{id:'fresh-b'},{id:'fresh-c'}],
  priorityState
);
assert.deepEqual(prioritized.map(x=>x.id),['fresh-b','fresh-c','old-a']);

__shardvaultTest.clearCodeTargetFailure(permanentState,'bad-shape');
assert.deepEqual(permanentState.failed_endpoint_ids,[]);
assert.equal(permanentState.endpoint_failures['bad-shape'],undefined);

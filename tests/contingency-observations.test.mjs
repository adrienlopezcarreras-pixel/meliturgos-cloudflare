import test from 'node:test';
import assert from 'node:assert/strict';
import { observedContingencyFromProbes, CONTINGENCY_PARTS } from '../src/continuity/contingency-observations.js';
import { currentContingency } from '../src/continuity/contingency-plan.js';
const now=Date.parse('2026-11-03T20:00:00Z');
const row=(part,up,observed_at='2026-11-03T19:59:00Z')=>({part,up,observed_at,observer:'probe-service',evidence_id:'example-'+part});
test('unknown health never fabricates failure across seven parts',()=>{
  const result=observedContingencyFromProbes([], {now});
  assert.deepEqual(result.observed,{});
  assert.equal(result.authenticated,false);
  assert.equal(currentContingency(result.observed).kind,'NONE');
  assert.deepEqual(Object.keys(result.details).sort(),[...CONTINGENCY_PARTS].sort());
});
test('fresh failure reports drive scenario while stale and future reports do not',()=>{
  const result=observedContingencyFromProbes([row('github',false),row('model',false,'2026-11-02T00:00:00Z'),row('gmail',false,'2026-11-04T00:00:00Z')],{now});
  assert.deepEqual(currentContingency(result.observed).down,['github']);
  assert.equal(result.details.model.status,'UNKNOWN');
  assert.equal(result.details.gmail.status,'UNKNOWN');
});
test('equal-time contradictions fail closed as unknown and newer results supersede older ones',()=>{
  const conflict=observedContingencyFromProbes([row('shards',false),row('shards',true)],{now});
  assert.equal(conflict.details.shards.status,'UNKNOWN');
  const newer=observedContingencyFromProbes([row('shards',false,'2026-11-03T19:58:00Z'),row('shards',true)],{now});
  assert.equal(newer.observed.shardsUp,true);
});

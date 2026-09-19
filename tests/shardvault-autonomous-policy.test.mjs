import assert from 'node:assert/strict';
import { __autonomousTest } from '../src/continuity/autonomous-repositories.js';

const base = {
  id:'anon-a',
  urlTemplate:'https://storage.example.test/{objectId}',
  method:'PUT',
  maxObjectBytes:1024 * 1024,
  operatorDomain:'operator-a.test',
  providerId:'provider-a',
  jurisdiction:'FR',
  policyUrl:'https://storage.example.test/policy',
  policyReviewedAt:new Date().toISOString(),
  expectedRetentionDays:30,
  authMode:'none',
  anonymousWriteDeclared:true,
  publicReadDeclared:true,
  automationAllowedDeclared:true,
  freeDeclared:true,
  writeProbeAllowed:true,
};
const good = __autonomousTest.normalize(base,'test');
assert.equal(__autonomousTest.eligible(good,{requiredBytes:4096}).ok,true);

for (const patch of [
  {authMode:'token'},
  {anonymousWriteDeclared:false},
  {publicReadDeclared:false},
  {automationAllowedDeclared:false},
  {freeDeclared:false},
  {writeProbeAllowed:false},
]) {
  const candidate = __autonomousTest.normalize({...base,...patch},'test');
  assert.equal(__autonomousTest.eligible(candidate,{requiredBytes:4096}).ok,false);
}

const selected = __autonomousTest.choose([
  {...good,id:'a1',score:100,confidence:50},
  {...good,id:'a2',operatorDomain:'operator-a.test',providerId:'provider-a',score:99,confidence:50},
  {...good,id:'b1',operatorDomain:'operator-b.test',providerId:'provider-b',score:98,confidence:50},
  {...good,id:'c1',operatorDomain:'operator-c.test',providerId:'provider-c',score:97,confidence:50},
],3,2,2);
assert.deepEqual(selected.map(x=>x.id),['a1','b1','c1']);
console.log('Autonomous repository policy tests: OK');

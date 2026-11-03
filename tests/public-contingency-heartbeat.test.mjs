import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyHttpAuthSurface, enforceHttpAuthPolicy } from '../src/security/http-auth-policy.js';

const url='https://mel.example.net/api/public/contingency/heartbeat';
test('public heartbeat permits GET only, not writes and not generalized health-data access',()=>{
  assert.equal(classifyHttpAuthSurface(new Request(url,{method:'GET'})).kind,'PUBLIC_SANITIZED');
  assert.equal(enforceHttpAuthPolicy(new Request(url,{method:'GET'}),{}),null);
  assert.equal(classifyHttpAuthSurface(new Request(url,{method:'POST'})).kind,'OWNER_AUTH');
  assert.equal(classifyHttpAuthSurface(new Request('https://mel.example.net/api/gen2/readiness')).kind,'OWNER_AUTH');
});

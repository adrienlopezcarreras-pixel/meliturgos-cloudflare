import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyHttpAuthSurface, enforceHttpAuthPolicy } from '../src/security/http-auth-policy.js';
import worker from '../src/index.js';

const url='https://mel.example.net/api/public/contingency/heartbeat';
test('public heartbeat permits GET only, not writes and not generalized health-data access',()=>{
  assert.equal(classifyHttpAuthSurface(new Request(url,{method:'GET'})).kind,'PUBLIC_SANITIZED');
  assert.equal(enforceHttpAuthPolicy(new Request(url,{method:'GET'}),{}),null);
  assert.equal(classifyHttpAuthSurface(new Request(url,{method:'POST'})).kind,'OWNER_AUTH');
  assert.equal(classifyHttpAuthSurface(new Request('https://mel.example.net/api/gen2/readiness')).kind,'OWNER_AUTH');
});

test('actual Worker heartbeat returns only constant public reachability and protects writes', async () => {
  const env={ MELITURGOS_USER:'test', MELITURGOS_PASSWORD:'secret-only-test' };
  const response=await worker.fetch(new Request(url),env);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ ok:true, service:'mel', schema:'mel.contingency-heartbeat/v1' });
  assert.equal(response.headers.get('cache-control'),'no-store');
  const post=await worker.fetch(new Request(url,{method:'POST'}),env);
  assert.equal(post.status,401);
});

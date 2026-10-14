import test from 'node:test';
import assert from 'node:assert/strict';
import { isReleaseSmokeRequest } from '../src/core/security.js';
import { readFileSync } from 'node:fs';

const token = 's'.repeat(48);
const env = { MEL_STRESS_PROOF_TOKEN: token };
function req(path, method = 'POST', supplied = token) {
  return new Request('https://mel.test' + path, {
    method,
    headers: { 'x-mel-release-smoke': '1', 'x-mel-stress-proof': supplied },
  });
}

test('stress token is valid only for dedicated POST route', () => {
  assert.equal(isReleaseSmokeRequest(req('/api/gen2/capabilities/execute'), env), true);
  assert.equal(isReleaseSmokeRequest(req('/api/gen2/capabilities/execute', 'POST', 'bad'), env), false);
  assert.equal(isReleaseSmokeRequest(req('/api/chat'), env), false);
  assert.equal(isReleaseSmokeRequest(req('/api/gen2/capabilities/execute', 'GET'), env), false);
  assert.equal(isReleaseSmokeRequest(req('/api/files/upload'), env), false);
});
test('stress token enforces a separate capability scope', () => {
  const router = readFileSync('src/router.js', 'utf8');
  assert.ok(router.includes('STRESS_PROOF_SCOPE_DENIED'));
  assert.ok(router.includes("['capability.audit', 'capability.audit.status']"));
  assert.ok(router.includes("request.headers.has('x-mel-parallel-proof')"));
  assert.ok(router.includes("request.headers.has('x-mel-launch-bootstrap')"));
});

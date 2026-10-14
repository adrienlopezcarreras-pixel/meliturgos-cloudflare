import test from 'node:test';
import assert from 'node:assert/strict';
import { isReleaseSmokeRequest } from '../src/core/security.js';
import worker from '../src/index.js';
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

test('real worker rejects non-audit capability under stress token', async () => {
  const request = new Request('https://mel.test/api/gen2/capabilities/execute', {
    method: 'POST',
    headers: {
      'x-mel-release-smoke': '1',
      'x-mel-stress-proof': token,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ id: 'cloudflare.deployments.create', input: {} }),
  });
  const response = await worker.fetch(request, env, {});
  assert.equal(response.status, 403);
  const data = await response.json();
  assert.equal(data.code, 'STRESS_PROOF_SCOPE_DENIED');
});

test('stress token requires smoke marker and complete secret', () => {
  const noMarker = new Request('https://mel.test/api/gen2/capabilities/execute', {
    method: 'POST', headers: { 'x-mel-stress-proof': token },
  });
  assert.equal(isReleaseSmokeRequest(noMarker, env), false);
  assert.equal(isReleaseSmokeRequest(req('/api/gen2/capabilities/execute'), {}), false);
  assert.equal(isReleaseSmokeRequest(req('/api/gen2/capabilities/execute'), { MEL_STRESS_PROOF_TOKEN: 'short' }), false);
  assert.equal(isReleaseSmokeRequest(req('/api/gen2/capabilities/execute', 'POST', 'x'.repeat(48)), env), false);
});
test('stress-only scope is not inadvertently expanded by the release allowlist', () => {
  const router = readFileSync('src/router.js', 'utf8');
  const scope = router.slice(router.indexOf('// A stress credential is valid only'), router.indexOf('const runtime = createGen2Runtime', router.indexOf('// A stress credential is valid only')));
  assert.ok(scope.includes("['capability.audit', 'capability.audit.status']"));
  assert.ok(scope.includes('STRESS_PROOF_SCOPE_DENIED'));
  assert.ok(!scope.includes('cloudflare.deployments.create'));
  assert.ok(!scope.includes('github.actions.workflow.dispatch'));
});

test('HTTP router denies destructive capability IDs for scoped stress proof', async () => {
  const { default: worker } = await import('../src/index.js');
  for (const id of ['cloudflare.deployments.create', 'github.actions.workflow.dispatch', 'work.plan.save', 'browser.execute', 'echo']) {
    const response = await worker.fetch(new Request('https://mel.test/api/gen2/capabilities/execute', {
      method: 'POST',
      headers: { 'content-type':'application/json', 'x-mel-release-smoke':'1', 'x-mel-stress-proof':token },
      body: JSON.stringify({ id, input: {} }),
    }), env, {});
    assert.equal(response.status, 403, id);
    const body = await response.json();
    assert.equal(body.code, 'STRESS_PROOF_SCOPE_DENIED', id);
  }
});

test('central authorization rejects mixed stress and release credentials', () => {
  for (const other of ['x-mel-parallel-proof', 'x-mel-launch-bootstrap']) {
    const headers = { 'x-mel-release-smoke':'1', 'x-mel-stress-proof':token, [other]:'p'.repeat(48) };
    const mixed = new Request('https://mel.test/api/gen2/capabilities/execute', {method:'POST',headers});
    const mixedEnv={...env,MEL_PARALLEL_PROOF_TOKEN:'p'.repeat(48),MEL_LAUNCH_BOOTSTRAP_TOKEN:'p'.repeat(48)};
    assert.equal(isReleaseSmokeRequest(mixed,mixedEnv),false,other);
  }
});

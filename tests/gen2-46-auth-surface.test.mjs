import test from 'node:test';
import assert from 'node:assert/strict';

import app from '../src/index.js';
import {
  classifyHttpAuthSurface,
  enforceHttpAuthPolicy,
  HTTP_AUTH_POLICY,
} from '../src/security/http-auth-policy.js';

const ORIGIN = 'https://mel.test';
const ownerEnv = { MELITURGOS_USER: 'owner', MELITURGOS_PASSWORD: 'secret' };

function req(path, { method = 'GET', headers = {}, body } = {}) {
  return new Request(ORIGIN + path, { method, headers, body });
}

function basic(user = 'owner', password = 'secret') {
  return 'Basic ' + Buffer.from(user + ':' + password, 'utf8').toString('base64');
}

test('GEN2-46 defaults every API surface to owner auth', () => {
  for (const [method, path] of [
    ['POST', '/api/chat'],
    ['POST', '/api/files/upload'],
    ['POST', '/api/voice/transcribe'],
    ['GET', '/api/memory/status'],
    ['GET', '/api/work/health'],
    ['GET', '/api/gen2/readiness'],
    ['POST', '/api/gen2/council/state-of-play'],
    ['GET', '/api/gen2/import/chatgpt-status'],
    ['GET', '/api/future-sensitive'],
    ['GET', '/api/internal/future-sensitive'],
    ['POST', '/api/teacher/status'],
    ['POST', '/api/gen2/autonomy/control'],
  ]) {
    assert.equal(classifyHttpAuthSurface(req(path, { method })).kind, 'OWNER_AUTH', method + ' ' + path);
  }
});

test('GEN2-46 keeps only explicit read-only public and delegated strong-auth exceptions', () => {
  assert.equal(classifyHttpAuthSurface(req('/api/teacher/status')).kind, 'PUBLIC_SANITIZED');
  assert.equal(classifyHttpAuthSurface(req('/api/teacher/launch-readiness')).kind, 'PUBLIC_SANITIZED');
  assert.equal(classifyHttpAuthSurface(req('/api/gen2/autonomy/control')).kind, 'PUBLIC_SANITIZED');

  assert.equal(classifyHttpAuthSurface(req('/api/device/v1/pair', { method: 'POST' })).kind, 'DELEGATED_STRONG_AUTH');
  assert.equal(classifyHttpAuthSurface(req('/api/computer/v1/pair', { method: 'POST' })).kind, 'DELEGATED_STRONG_AUTH');
  assert.equal(classifyHttpAuthSurface(req('/api/internal/release-launch-bootstrap', { method: 'POST' })).kind, 'DELEGATED_STRONG_AUTH');
  assert.equal(classifyHttpAuthSurface(req('/api/dev-bridge/heartbeat')).kind, 'DEV_BRIDGE_TOKEN');
  assert.equal(classifyHttpAuthSurface(req('/professor')).kind, 'NON_API');

  assert.equal(HTTP_AUTH_POLICY.default_api_policy, 'OWNER_AUTH');
  assert.deepEqual(HTTP_AUTH_POLICY.delegated_exact, ['/api/internal/release-launch-bootstrap']);
});

test('GEN2-46 owner preflight fails closed before sensitive handlers can touch runtime bindings', async () => {
  for (const [method, path, options] of [
    ['POST', '/api/chat', { headers: { 'content-type': 'application/json' }, body: '{}' }],
    ['POST', '/api/files/upload', {}],
    ['POST', '/api/voice/transcribe', {}],
    ['GET', '/api/memory/status', {}],
    ['GET', '/api/work/health', {}],
    ['GET', '/api/gen2/autonomy/state', {}],
    ['GET', '/api/gen2/readiness', {}],
    ['POST', '/api/gen2/council/state-of-play', { headers: { 'content-type': 'application/json' }, body: '{}' }],
    ['GET', '/api/gen2/import/chatgpt-status', {}],
    ['GET', '/api/gen2/capabilities', {}],
    ['GET', '/api/future-sensitive', {}],
  ]) {
    const response = await app.fetch(req(path, { method, ...options }), ownerEnv, {});
    assert.equal(response.status, 401, method + ' ' + path);
    const payload = await response.json();
    assert.equal(payload.code, 'AUTH_REQUIRED', method + ' ' + path);
    assert.match(response.headers.get('cache-control') || '', /no-store/i, method + ' ' + path);
  }
});

test('GEN2-46 delegated protocols still enforce their purpose-specific credential', async () => {
  const terminal = await app.fetch(req('/api/device/v1/pair-code', { method: 'POST' }), ownerEnv, {});
  assert.equal(terminal.status, 401);
  assert.equal((await terminal.json()).code, 'AUTH_REQUIRED');

  const computer = await app.fetch(req('/api/computer/v1/pair', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ computer_id: 'pc-test' }),
  }), ownerEnv, {});
  assert.equal(computer.status, 401);
  assert.equal((await computer.json()).code, 'AUTH_REQUIRED');

  const bootstrap = await app.fetch(req('/api/internal/release-launch-bootstrap', { method: 'POST' }), ownerEnv, {});
  assert.equal(bootstrap.status, 401);
  assert.equal((await bootstrap.json()).code, 'BOOTSTRAP_AUTH_REQUIRED');

  const bridge = enforceHttpAuthPolicy(req('/api/dev-bridge/heartbeat'), ownerEnv);
  assert.ok(bridge instanceof Response);
  assert.equal(bridge.status, 503);
  assert.equal((await bridge.json()).code, 'BRIDGE_NOT_CONFIGURED');
});

test('GEN2-46 exact owner credentials pass central preflight while wrong credentials remain rejected', async () => {
  const allowed = enforceHttpAuthPolicy(req('/api/future-sensitive', {
    headers: { authorization: basic() },
  }), ownerEnv);
  assert.equal(allowed, null);

  const rejected = enforceHttpAuthPolicy(req('/api/future-sensitive', {
    headers: { authorization: basic('owner', 'wrong') },
  }), ownerEnv);
  assert.ok(rejected instanceof Response);
  assert.equal(rejected.status, 401);

  const notConfigured = enforceHttpAuthPolicy(req('/api/future-sensitive'), { MELITURGOS_USER: 'owner' });
  assert.ok(notConfigured instanceof Response);
  assert.equal(notConfigured.status, 503);
  assert.equal((await notConfigured.json()).code, 'AUTH_NOT_CONFIGURED');
  assert.match(notConfigured.headers.get('cache-control') || '', /no-store/i);
});

test('GEN2-46 public GET exceptions never make write methods public', () => {
  for (const path of ['/api/teacher/status', '/api/teacher/work', '/api/gen2/autonomy/control']) {
    assert.equal(classifyHttpAuthSurface(req(path, { method: 'GET' })).kind, 'PUBLIC_SANITIZED');
    assert.equal(classifyHttpAuthSurface(req(path, { method: 'POST' })).kind, 'OWNER_AUTH');
    assert.equal(classifyHttpAuthSurface(req(path, { method: 'DELETE' })).kind, 'OWNER_AUTH');
  }
});

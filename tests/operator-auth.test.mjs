import test from 'node:test';
import assert from 'node:assert/strict';
import { authorized, requireAuth, isReleaseSmokeRequest } from '../src/core/security.js';

function requestWithAuthorization(value) {
  return new Request('https://meliturgos.test/api/gen2/autonomy/tick', {
    method: 'POST',
    headers: value ? { authorization: value } : {},
  });
}

function basic(user, pass) {
  return `Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;
}

test('operator auth accepts ordinary curl-style Basic credentials', () => {
  const env = { MELITURGOS_USER: 'adrien', MELITURGOS_PASSWORD: 'MotDePasse123456789' };
  assert.equal(authorized(requestWithAuthorization(basic('adrien', 'MotDePasse123456789')), env), true);
});

test('operator auth decodes UTF-8 Basic credentials correctly', () => {
  const env = { MELITURGOS_USER: 'adrien', MELITURGOS_PASSWORD: 'mél-été-2026-🔐' };
  assert.equal(authorized(requestWithAuthorization(basic('adrien', 'mél-été-2026-🔐')), env), true);
});

test('operator auth accepts Bearer password fallback for robust CLI calls', () => {
  const env = { MELITURGOS_USER: 'adrien', MELITURGOS_PASSWORD: 'SafeCliPassword123' };
  assert.equal(authorized(requestWithAuthorization('Bearer SafeCliPassword123'), env), true);
});

test('operator auth tolerates only a terminal CR/LF accidentally present in configured secret', () => {
  const env = { MELITURGOS_USER: 'adrien', MELITURGOS_PASSWORD: 'SafeCliPassword123\r\n' };
  assert.equal(authorized(requestWithAuthorization('Bearer SafeCliPassword123'), env), true);
});

test('operator auth remains fail-closed for wrong user, wrong password and missing auth', () => {
  const env = { MELITURGOS_USER: 'adrien', MELITURGOS_PASSWORD: 'correct-password' };
  assert.equal(authorized(requestWithAuthorization(basic('other', 'correct-password')), env), false);
  assert.equal(authorized(requestWithAuthorization(basic('adrien', 'wrong-password')), env), false);
  assert.equal(authorized(requestWithAuthorization('Bearer wrong-password'), env), false);
  assert.equal(authorized(requestWithAuthorization(null), env), false);
});

test('requireAuth distinguishes unconfigured auth from rejected credentials without exposing secrets', async () => {
  const missing = requireAuth(requestWithAuthorization(null), { MELITURGOS_USER: 'adrien' });
  assert.equal(missing.ok, false);
  assert.equal(missing.response.status, 503);
  assert.equal((await missing.response.clone().json()).code, 'AUTH_NOT_CONFIGURED');

  const rejected = requireAuth(requestWithAuthorization('Bearer nope'), {
    MELITURGOS_USER: 'adrien',
    MELITURGOS_PASSWORD: 'hidden-value',
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.response.status, 401);
  const payload = await rejected.response.json();
  assert.equal(payload.code, 'AUTH_REQUIRED');
  assert.equal(JSON.stringify(payload).includes('hidden-value'), false);
});


test('ephemeral release smoke auth is restricted to exact read-only verification routes plus POST /api/chat', () => {
  const token = 'b'.repeat(64);
  const env = {
    MELITURGOS_USER: 'adrien',
    MELITURGOS_PASSWORD: 'owner-password',
    MEL_LAUNCH_BOOTSTRAP_TOKEN: token,
  };
  const headers = {
    'x-mel-release-smoke': '1',
    'x-mel-launch-bootstrap': token,
  };

  const chat = new Request('https://meliturgos.test/api/chat', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'lis src/index.js dans ton code' }),
  });
  assert.equal(isReleaseSmokeRequest(chat, env), true);
  assert.equal(authorized(chat, env), true);

  for (const path of [
    '/api/gen2/code/self-check',
    '/api/memory/status',
    '/professor',
    '/normal-runtime.js',
  ]) {
    const request = new Request('https://meliturgos.test' + path, { method:'GET', headers });
    assert.equal(isReleaseSmokeRequest(request, env), true, path);
    assert.equal(authorized(request, env), true, path);
  }

  for (const [method,path] of [
    ['POST','/api/export'],
    ['POST','/api/memory/status'],
    ['POST','/professor'],
    ['GET','/api/chat'],
    ['POST','/api/gen2/capabilities/execute'],
    ['DELETE','/api/gen2/conversations'],
  ]) {
    const request = new Request('https://meliturgos.test' + path, { method, headers });
    assert.equal(isReleaseSmokeRequest(request, env), false, method + ' ' + path);
    assert.equal(authorized(request, env), false, method + ' ' + path);
  }

  const wrongToken = new Request('https://meliturgos.test/api/chat', {
    method: 'POST',
    headers: {
      'x-mel-release-smoke':'1',
      'x-mel-launch-bootstrap':'c'.repeat(64),
    },
  });
  assert.equal(isReleaseSmokeRequest(wrongToken, env), false);
  assert.equal(authorized(wrongToken, env), false);
});

test('release smoke token shorter than 32 characters is never accepted', () => {
  const token = 'x'.repeat(31);
  const request = new Request('https://meliturgos.test/api/chat', {
    method:'POST',
    headers:{'x-mel-release-smoke':'1','x-mel-launch-bootstrap':token},
  });
  assert.equal(isReleaseSmokeRequest(request, {
    MELITURGOS_PASSWORD:'owner-password',
    MEL_LAUNCH_BOOTSTRAP_TOKEN:token,
  }), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { authorized, requireAuth } from '../src/core/security.js';

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

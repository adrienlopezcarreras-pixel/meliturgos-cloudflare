import test from 'node:test';
import assert from 'node:assert/strict';

import router from '../../src/router.js';
import { classifyHttpAuthSurface } from '../../src/security/http-auth-policy.js';

const env={MELITURGOS_USER:'owner',MELITURGOS_PASSWORD:'secret'};

test('MEL-CONN-01 public WordPress page bypasses owner auth only on its exact GET path', async () => {
  const response=await router.fetch(new Request('https://mel.example/public/wordpress-chat'),env,{});
  assert.equal(response.status,200);
  assert.match(await response.text(),/Votre question à MEL/);

  const privateResponse=await router.fetch(new Request('https://mel.example/mvp'),env,{});
  assert.equal(privateResponse.status,401);
});

test('MEL-CONN-01 public chat API methods are explicit sanitized exceptions', () => {
  assert.equal(
    classifyHttpAuthSurface(new Request('https://mel.example/api/public/wordpress/chat',{method:'POST'})).kind,
    'PUBLIC_SANITIZED',
  );
  assert.equal(
    classifyHttpAuthSurface(new Request('https://mel.example/api/public/wordpress/chat',{method:'OPTIONS'})).kind,
    'PUBLIC_SANITIZED',
  );
  assert.equal(
    classifyHttpAuthSurface(new Request('https://mel.example/api/public/wordpress/chat',{method:'GET'})).kind,
    'OWNER_AUTH',
  );
  assert.equal(
    classifyHttpAuthSurface(new Request('https://mel.example/api/public/wordpress/other',{method:'POST'})).kind,
    'OWNER_AUTH',
  );
});

test('MEL-CONN-01 public POST reaches handler instead of owner auth', async () => {
  const response=await router.fetch(new Request('https://mel.example/api/public/wordpress/chat',{
    method:'POST',
    headers:{origin:'https://verite-interdite.fr','content-type':'application/json'},
    body:JSON.stringify({message:'bonjour'}),
  }),env,{});
  assert.equal(response.status,503);
  assert.equal((await response.json()).error,'PUBLIC_AI_UNAVAILABLE');
});

test('MEL-CONN-01 OPTIONS remains public but foreign origin is rejected by handler', async () => {
  const ok=await router.fetch(new Request('https://mel.example/api/public/wordpress/chat',{
    method:'OPTIONS',
    headers:{origin:'https://verite-interdite.fr'},
  }),env,{});
  assert.equal(ok.status,204);

  const denied=await router.fetch(new Request('https://mel.example/api/public/wordpress/chat',{
    method:'OPTIONS',
    headers:{origin:'https://evil.example'},
  }),env,{});
  assert.equal(denied.status,403);
});

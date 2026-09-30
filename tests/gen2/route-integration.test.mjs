import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../src/index.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';

function env() { return { DB: sqliteD1(), MELITURGOS_USER: 'test', MELITURGOS_PASSWORD: 'test-only' }; }
function auth() { return { authorization: `Basic ${Buffer.from('test:test-only').toString('base64')}` }; }

test('active entrypoint protects normal MEL while keeping legacy Professor v1 canonical', async () => {
  const e = env();
  try {
    for (const path of ['/', '/mvp', '/professor-v1']) {
      assert.equal((await worker.fetch(new Request(`http://localhost${path}`), e)).status, 401);
    }
    for (const path of ['/', '/mvp']) {
      const response = await worker.fetch(new Request(`http://localhost${path}`, { headers: auth() }), e);
      const body = await response.text();
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') || '', /text\/html/);
      assert.match(body, /<title>MEL<\/title>/);
      assert.match(body, /id="full"/);
      assert.match(body, /\/normal-runtime\.js\?v=8/);
    }
    const runtimeResponse = await worker.fetch(new Request('http://localhost/normal-runtime.js?v=8', { headers: auth() }), e);
    assert.equal(runtimeResponse.status, 200);
    assert.match(runtimeResponse.headers.get('content-type') || '', /application\/javascript/);
    assert.match(await runtimeResponse.text(), /location\.href='\/professor'/);
    const legacyProfessor = await worker.fetch(new Request('http://localhost/professor-v1', { headers: auth() }), e);
    assert.equal(legacyProfessor.status, 308);
    assert.equal(legacyProfessor.headers.get('location'), '/professor');
    assert.equal(legacyProfessor.headers.get('cache-control'), 'no-store');
  } finally { e.DB.close(); }
});

test('conversation REST route uses ConversationService and persists add-only archive', async () => {
  const e = env();
  try {
    const created = await worker.fetch(new Request('http://localhost/api/conversations', { method: 'POST', headers: {...auth(), 'content-type':'application/json'}, body: JSON.stringify({title:'integration'}) }), e);
    assert.equal(created.status, 201); const conversation = await created.json(); assert.ok(conversation.id);
    const added = await worker.fetch(new Request(`http://localhost/api/conversations/${conversation.id}/messages`, { method: 'POST', headers: {...auth(), 'content-type':'application/json'}, body: JSON.stringify({content:'hello'}) }), e);
    assert.equal(added.status, 201);
    const history = await worker.fetch(new Request(`http://localhost/api/conversations/${conversation.id}/messages`, {headers:auth()}), e);
    assert.equal((await history.json()).messages.length, 1);
  } finally { e.DB.close(); }
});

test('professor serves current full-control center in server HTML', async () => {
  const e = { DB: sqliteD1(), MELITURGOS_USER: 'test', MELITURGOS_PASSWORD: 'test-only', AI: { async run(){ return {response:'ok'} } } };
  try {
    const response = await worker.fetch(new Request('http://localhost/professor', {headers: auth()}), e);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /<title>Mode complet<\/title>/);
    assert.match(body, /data-panel="roadmap"/);
    assert.match(body, /data-mode-panel="development" hidden/);
    assert.match(body, /Feuille de route complète/);
  } finally { e.DB.close(); }
});

test('dev bridge token routes before Basic Auth while professor remains protected', async () => {
  const e = { DB: sqliteD1(), MELITURGOS_USER: 'test', MELITURGOS_PASSWORD: 'test-only', MEL_DEV_BRIDGE_TOKEN: 'bridge-test' };
  try {
    const headers = { authorization: 'Bearer bridge-test', 'content-type': 'application/json' };
    assert.equal((await worker.fetch(new Request('http://localhost/api/dev-bridge/heartbeat', { method: 'POST', headers, body: '{}' }), e)).status, 200);
    assert.equal((await worker.fetch(new Request('http://localhost/api/dev-bridge/heartbeat', { method: 'POST', headers: { authorization: 'Bearer wrong' }, body: '{}' }), e)).status, 401);
    assert.equal((await worker.fetch(new Request('http://localhost/api/dev-bridge/heartbeat', { method: 'POST', body: '{}' }), e)).status, 401);
    assert.equal((await worker.fetch(new Request('http://localhost/professor'), e)).status, 401);
  } finally { e.DB.close(); }
});

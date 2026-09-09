import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../src/index.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';

function env() { return { DB: sqliteD1(), MELITURGOS_USER: 'test', MELITURGOS_PASSWORD: 'test-only' }; }
function auth() { return { authorization: `Basic ${Buffer.from('test:test-only').toString('base64')}` }; }

test('active entrypoint protects and serves both canonical MVP routes', async () => {
  const e = env();
  try {
    for (const path of ['/', '/mvp']) {
      assert.equal((await worker.fetch(new Request(`http://localhost${path}`), e)).status, 401);
      const response = await worker.fetch(new Request(`http://localhost${path}`, { headers: auth() }), e);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /^text\/html/);
      assert.match(await response.text(), /MELITURGOS/);
    }
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

test('professor serves self-development section in server HTML', async () => {
  const env = { DB: sqliteD1(), MELITURGOS_USER: 'test', MELITURGOS_PASSWORD: 'test-only', AI: { async run(){ return {response:'ok'} } } };
  try { const response = await worker.fetch(new Request('http://localhost/professor', {headers: auth()}), env); const body = await response.text(); assert.equal(response.status, 200); assert.ok(body.includes('id="professor-dev"')); assert.ok(body.includes('Développement de MEL')); assert.ok(body.includes('Préparer la modification')); } finally { env.DB.close(); }
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as legacyMvp } from '../src/pages/mvp-interface.js';
import { withConversationArchive } from '../src/conversations/intercept.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import worker from '../src/index.js';

function auth() { return { authorization: `Basic ${Buffer.from('test:test-only').toString('base64')}` }; }

test('legacy MVP entry redirects permanently to the canonical Professor UI without caching', async () => {
  const response = await legacyMvp({});
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), '/professor');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('canonical Professor UI is served by the real entrypoint', async () => {
  const DB = sqliteD1();
  const env = { DB, MELITURGOS_USER: 'test', MELITURGOS_PASSWORD: 'test-only' };
  try {
    const response = await worker.fetch(new Request('http://localhost/professor', { headers: auth() }), env);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/html/);
    assert.match(html, /<title>Mode complet<\/title>/);
    assert.match(html, /data-panel="chat"/);
    assert.match(html, /id="chatInput"/);
    assert.match(html, /id="chatSend"/);
    assert.match(html, /data-panel="roadmap"/);
    assert.match(html, /data-panel="work"/);
  } finally { DB.close(); }
});

test('archive survives request consumption and stores text, device, model and attachments', async () => {
  const DB = sqliteD1();
  try {
    const handler = withConversationArchive(async req => { await req.json(); return Response.json({ text: 'Réponse', model: 'test-engine' }); });
    const response = await handler(new Request('http://localhost/api/chat', { method: 'POST', body: JSON.stringify({ text: 'Question', conversation_id: 'c1', device_id: 'd1', attachments: [{ name: 'a.txt' }] }) }), { DB });
    assert.equal(response.status, 200);
    const { results } = await DB.prepare('SELECT * FROM archive_messages ORDER BY timestamp').all();
    assert.equal(results.length, 2);
    assert.equal(results[0].content, 'Question');
    assert.equal(results[1].content, 'Réponse');
    assert.equal(results[0].device_id, 'd1');
    assert.equal(results[1].model, 'test-engine');
    assert.deepEqual(JSON.parse(results[0].attachments_json), [{ name: 'a.txt' }]);
  } finally { DB.close(); }
});

test('failed chat responses are not archived as assistant answers', async () => {
  const DB = sqliteD1();
  try {
    const handler = withConversationArchive(async req => { await req.json(); return Response.json({ error: 'bad' }, { status: 503 }); });
    await handler(new Request('http://localhost/api/chat', { method: 'POST', body: JSON.stringify({ text: 'Question' }) }), { DB });
    assert.equal((await DB.prepare('SELECT * FROM archive_messages').all()).results.length, 0);
  } finally { DB.close(); }
});

test('real entrypoint chat integrates model router and archive with mocked AI', async () => {
  const DB = sqliteD1();
  const calls = [];
  const env = { DB, MELITURGOS_USER: 'test', MELITURGOS_PASSWORD: 'test-only', AI: { async run(model, input) { calls.push({ model, input }); return { response: 'Réponse du moteur de test' }; } } };
  try {
    const response = await worker.fetch(new Request('http://localhost/api/chat', { method: 'POST', headers: { authorization: 'Basic ' + btoa('test:test-only'), 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Bonjour', conversation_id: 'integration', device_id: 'browser' }) }), env);
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.equal(data.text, 'Réponse du moteur de test');
    assert.equal(calls.length, 1);
    assert.equal((await DB.prepare('SELECT * FROM archive_messages').all()).results.length, 2);
  } finally { DB.close(); }
});

test('conversation context is scoped and cognitive memory reaches the interchangeable engine', async () => {
  const DB = sqliteD1();
  const calls = [];
  const env = { DB, MELITURGOS_USER: 'test', MELITURGOS_PASSWORD: 'test-only', AI: { async run(model, input) { calls.push(input.messages); return { response: 'Réponse de test' }; } } };
  const request = (text, conversation_id) => new Request('http://localhost/api/chat', { method: 'POST', headers: { authorization: 'Basic ' + btoa('test:test-only'), 'content-type': 'application/json' }, body: JSON.stringify({ text, conversation_id }) });
  try {
    assert.equal((await worker.fetch(request('Souviens-toi que mon projet est le jardin solaire', 'garden'), env)).status, 200);
    assert.equal((await worker.fetch(request('Autre sujet confidentiel pour cette conversation', 'other'), env)).status, 200);
    const response = await worker.fetch(request('Quel est mon projet jardin solaire ?', 'garden'), env);
    assert.equal(response.status, 200);
    const messages = calls.at(-1);
    assert.ok(messages.some(message => message.role === 'user' && message.content.includes('Souviens-toi')));
    assert.ok(!messages.some(message => message.role === 'user' && message.content.includes('Autre sujet')));
    assert.match(messages[0].content, /jardin solaire/);
    assert.equal((await DB.prepare('SELECT * FROM memories').all()).results.length, 1);
  } finally { DB.close(); }
});

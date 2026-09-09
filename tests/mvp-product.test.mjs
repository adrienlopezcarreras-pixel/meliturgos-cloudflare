import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { onRequestGet } from '../src/pages/mvp-interface.js';
import { withConversationArchive } from '../src/conversations/intercept.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import worker from '../src/index.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 30));

async function ui(chatFetch, gen2Fetch = async () => Response.json({ capabilities: [] })) {
  const html = await (await onRequestGet({})).text();
  const dom = new JSDOM(html, {
    url: 'http://localhost',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.fetch = (path, init) => String(path).startsWith('/api/gen2/') ? gen2Fetch(path, init) : chatFetch(path, init);
      window.AbortSignal = AbortSignal;
    },
  });
  await tick();
  return dom;
}

test('MEL MVP has the requested single-window interface without visible conversation selector', async () => {
  const html = await (await onRequestGet({})).text();
  assert.match(html, /<div class="title">MEL<\/div>/);
  assert.doesNotMatch(html, /conversationSelect|newConversation|interaction_count/i);
  assert.match(html, /id="messages"/);
  assert.match(html, /id="input"/);
  assert.match(html, /id="send"/);
  assert.match(html, /id="skills"/);
  assert.match(html, /id="full"/);
  assert.match(html, /id="fileInput"/);
});

test('MVP sends text to chat, renders answer in the same window and prevents double send', async () => {
  const calls = [];
  let finish;
  const dom = await ui((path, init) => {
    calls.push({ path, body: JSON.parse(init.body) });
    return new Promise(resolve => { finish = resolve; });
  });
  const document = dom.window.document;
  document.querySelector('#input').value = 'Bonjour';
  document.querySelector('#send').click();
  document.querySelector('#send').click();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/api/chat');
  assert.equal(calls[0].body.text, 'Bonjour');
  assert.ok(calls[0].body.conversation_id);
  assert.match(document.querySelector('#status').textContent, /réfléchit/);
  finish(Response.json({ text: 'Bonjour Adrien' }));
  await tick();
  assert.match(document.querySelector('#messages').textContent, /Bonjour Adrien/);
  assert.equal(document.querySelector('#input').value, '');
  dom.window.close();
});

test('MVP keeps draft on failure and renders text safely', async () => {
  const dom = await ui(async () => Response.json({ error: 'failed' }, { status: 503 }));
  const document = dom.window.document;
  const payload = '<img src=x onerror=alert(1)>';
  document.querySelector('#input').value = payload;
  document.querySelector('#send').click();
  await tick();
  assert.match(document.querySelector('#status').textContent, /indisponible/);
  assert.equal(document.querySelector('#input').value, payload);
  assert.equal(document.querySelectorAll('#messages img').length, 0);
  assert.equal(document.querySelector('#send').disabled, false);
  dom.window.close();
});

test('MVP exposes real server capabilities through the Compétences button', async () => {
  const paths = [];
  const dom = await ui(async () => Response.json({ text: 'ok' }), async path => {
    paths.push(path);
    return Response.json({ capabilities: [{ id: 'code.read', name: 'Lecture du code', description: 'Lit le code MEL', enabled: true, health: 'HEALTHY' }] });
  });
  const document = dom.window.document;
  document.querySelector('#skills').click();
  await tick();
  assert.ok(paths.includes('/api/gen2/capabilities'));
  assert.match(document.querySelector('#skillsList').textContent, /Lecture du code/);
  assert.match(document.querySelector('#skillsList').textContent, /ACTIF/);
  dom.window.close();
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

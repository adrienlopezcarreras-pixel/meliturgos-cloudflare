import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { onRequestGet } from '../src/pages/mvp-interface.js';

const tick = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));

async function createUi(chatFetch) {
  const html = await (await onRequestGet({})).text();
  const dom = new JSDOM(html, {
    url: 'http://localhost',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.fetch = (path, init) => {
        if (String(path).startsWith('/api/gen2/conversations/messages')) {
          return Promise.resolve(Response.json({ messages: [] }));
        }
        if (String(path).startsWith('/api/gen2/conversations')) {
          return Promise.resolve(Response.json({ conversations: [] }));
        }
        return chatFetch(path, init);
      };
    }
  });
  await tick();
  return dom;
}

test('composer stays editable and queues a second message while the first is generating', async () => {
  const calls = [];
  const resolvers = [];
  const dom = await createUi((path, init) => {
    calls.push({ path, init, body: JSON.parse(init.body) });
    return new Promise(resolve => resolvers.push(resolve));
  });

  const d = dom.window.document;
  const input = d.querySelector('#messageInput');
  const send = d.querySelector('#sendBtn');

  input.value = 'Premier message';
  send.click();
  await tick(5);
  assert.equal(calls.length, 1);
  assert.equal(input.disabled, false);
  assert.equal(send.disabled, false);
  assert.equal(input.value, '');

  input.value = 'Deuxième message\nsur deux lignes';
  send.click();
  await tick(5);
  assert.equal(calls.length, 1, 'the second network call must wait for the first answer');
  assert.match(d.querySelector('#queueState').textContent, /1 en attente/);
  assert.equal(input.disabled, false);

  resolvers[0](Response.json({ text: 'Réponse 1' }));
  await tick();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.text, 'Deuxième message\nsur deux lignes');

  resolvers[1](Response.json({ text: 'Réponse 2' }));
  await tick();
  assert.equal(d.querySelectorAll('.ai .content').length, 2);
  assert.equal(d.querySelector('#queueState').textContent, 'Prêt');
  dom.window.close();
});

test('Enter sends and Shift+Enter remains available for multiline composition', async () => {
  const calls = [];
  const dom = await createUi(async (path, init) => {
    calls.push(JSON.parse(init.body));
    return Response.json({ text: 'ok' });
  });
  const d = dom.window.document;
  const input = d.querySelector('#messageInput');

  input.value = 'ligne 1';
  const shiftEnter = new dom.window.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true });
  input.dispatchEvent(shiftEnter);
  await tick(5);
  assert.equal(calls.length, 0);
  assert.equal(shiftEnter.defaultPrevented, false);

  input.value = 'ligne 1\nligne 2';
  const enter = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  input.dispatchEvent(enter);
  await tick();
  assert.equal(enter.defaultPrevented, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].text, 'ligne 1\nligne 2');
  dom.window.close();
});

test('Stop aborts only the active response and keeps the next queued message', async () => {
  const calls = [];
  const dom = await createUi((path, init) => {
    calls.push({ body: JSON.parse(init.body), signal: init.signal });
    if (calls.length === 1) {
      return new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    }
    return Promise.resolve(Response.json({ text: 'Réponse suivante' }));
  });

  const d = dom.window.document;
  const input = d.querySelector('#messageInput');
  input.value = 'A';
  d.querySelector('#sendBtn').click();
  await tick(5);
  input.value = 'B';
  d.querySelector('#sendBtn').click();
  await tick(5);

  assert.equal(calls.length, 1);
  d.querySelector('#stopBtn').click();
  await tick();

  assert.equal(calls[0].signal.aborted, true);
  assert.equal(calls.length, 2, 'queued B must continue after stopping A');
  assert.equal(calls[1].body.text, 'B');
  assert.match(d.querySelector('#chatResults').textContent, /Réponse suivante/);
  assert.equal(d.querySelector('#messageInput').disabled, false);
  dom.window.close();
});

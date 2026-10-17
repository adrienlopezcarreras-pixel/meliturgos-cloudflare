import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  MEL_AUTO_RELAUNCH_SOURCE,
  melFindRecoveredReply,
  melIsTransientFailure,
  melRetryGet,
} from '../src/pages/mel-auto-relaunch.js';
import { onRequestGet as fullMode } from '../src/pages/full-interface-v2.js';

test('transient failures are recognised, functional errors are not', () => {
  for (const message of ['Réponse serveur trop lente', 'Failed to fetch', 'HTTP 503', 'HTTP 504', 'MEL n’a pas pu terminer dans le délai (CHAT_DEADLINE_EXCEEDED).']) {
    assert.equal(melIsTransientFailure(message), true, message);
  }
  for (const message of ['HTTP 401', 'HTTP 400', 'MESSAGE_REQUIRED', 'Aucun ordinateur appairé', 'HTTP 5030']) {
    assert.equal(melIsTransientFailure(message), false, message);
  }
});

test('GET retries only transient failures, with a bounded number of attempts', async () => {
  let calls = 0;
  const value = await melRetryGet(async () => { calls += 1; if (calls < 3) throw new Error('Failed to fetch'); return 'ok'; }, { sleep: async () => {} });
  assert.equal(value, 'ok');
  assert.equal(calls, 3);

  calls = 0;
  await assert.rejects(melRetryGet(async () => { calls += 1; throw new Error('Failed to fetch'); }, { sleep: async () => {} }), /Failed to fetch/);
  assert.equal(calls, 3, 'one call plus two relaunches at most');

  calls = 0;
  await assert.rejects(melRetryGet(async () => { calls += 1; throw new Error('HTTP 401'); }, { sleep: async () => {} }), /401/);
  assert.equal(calls, 1, 'authorisation errors are never retried');
});

test('recovered reply must follow the exact sent message and never be an error', () => {
  const rows = [
    { role: 'user', content: 'ancienne question' },
    { role: 'assistant', content: 'ancienne réponse' },
    { role: 'user', content: 'fais le point sur la release' },
    { role: 'assistant', content: 'La release est verte.' },
  ];
  assert.equal(melFindRecoveredReply(rows, 'fais le point sur la release'), 'La release est verte.');
  assert.equal(melFindRecoveredReply(rows.slice(0, 3), 'fais le point sur la release'), null, 'no reply yet');
  assert.equal(melFindRecoveredReply([...rows.slice(0, 3), { role: 'assistant', content: 'Erreur : HTTP 503' }], 'fais le point sur la release'), null);
  assert.equal(melFindRecoveredReply([...rows, { role: 'user', content: 'autre chose' }], 'question inconnue'), null);
  assert.equal(melFindRecoveredReply([...rows, { role: "user", content: "fais le point sur la release" }], "fais le point sur la release"), null, "a resent identical question must not reuse the old answer");
  assert.equal(melFindRecoveredReply(rows, 'ancienne question'), null, 'a newer user turn blocks stale replies');
});

function sandbox({ conversationRows }) {
  const calls = [];
  const sent = [];
  const chatlog = { children: [], scrollTop: 0, scrollHeight: 0,
    appendChild(node) { node.parentNode = this; this.children.push(node); },
    get lastElementChild() { return this.children.at(-1) || null; } };
  const status = { textContent: '' };
  const element = () => ({ parentNode: null, textContent: '', remove() { const list = this.parentNode?.children; if (list) list.splice(list.indexOf(this), 1); this.parentNode = null; } });
  const context = {
    window: { addEventListener() {} },
    document: {
      hidden: false,
      addEventListener() {},
      querySelector() { return null; },
      getElementById(id) { return id === 'chatlog' ? chatlog : id === 'chatStatus' ? status : null; },
      createElement: element,
    },
    setTimeout: fn => { fn(); return 0; },
    conversationId: 'conv-1',
  };
  vm.createContext(context);
  vm.runInContext(`
    var jfetch = async function (url, opts = {}) {
      __calls.push([String(opts.method || 'GET'), url]);
      if (url === '/api/mel/conversations/latest') return { conversation: { id: 'conv-1' }, messages: __rows() };
      if (String(opts.method || 'GET') === 'POST') throw new Error('Réponse serveur trop lente');
      return {};
    };
    var loadPanel = async function () {};
    var addMsg = function (role, text) { const d = document.createElement('div'); d.role = role; d.textContent = String(text); document.getElementById('chatlog').appendChild(d); };
    var sendChat = function (text) { __sent.push(text); };
  `, Object.assign(context, { __calls: calls, __sent: sent, __rows: () => conversationRows() }));
  vm.runInContext(MEL_AUTO_RELAUNCH_SOURCE, context);
  return { context, calls, sent, chatlog, status };
}

test('chat failure fetches the saved reply instead of resending the message', async () => {
  const rows = [{ role: 'user', content: 'capture mon écran' }];
  const box = sandbox({ conversationRows: () => rows });
  vm.runInContext(`addMsg('user', 'capture mon écran');`, box.context);
  await vm.runInContext(`jfetch('/api/chat', { method: 'POST' }).catch(() => {})`, box.context);
  assert.deepEqual(box.calls.filter(([method]) => method === 'POST').length, 1, 'POST is never relaunched');

  rows.push({ role: 'assistant', content: 'Capture faite, la voici.' });
  vm.runInContext(`addMsg('mel', 'Erreur : Réponse serveur trop lente')`, box.context);
  for (let i = 0; i < 20; i += 1) await new Promise(resolve => setImmediate(resolve));

  assert.equal(box.sent.length, 0, 'the message is never resent automatically');
  assert.equal(box.status.textContent, 'Réponse récupérée automatiquement.');
  const texts = box.chatlog.children.map(node => node.textContent);
  assert.deepEqual(texts, ['capture mon écran', 'Capture faite, la voici.'], 'the error bubble is replaced by the saved reply');
});

test('when nothing was saved the owner gets a resend button, not an automatic resend', async () => {
  const box = sandbox({ conversationRows: () => [{ role: 'user', content: 'tâche lourde' }] });
  vm.runInContext(`addMsg('user', 'tâche lourde'); addMsg('mel', 'Erreur : Failed to fetch')`, box.context);
  for (let i = 0; i < 30; i += 1) await new Promise(resolve => setImmediate(resolve));
  assert.equal(box.sent.length, 0);
  assert.equal(box.status.textContent, 'Aucune réponse enregistrée pour ce message.');
  const button = box.chatlog.children.at(-1);
  assert.equal(button.textContent, 'Renvoyer le message');
  button.onclick();
  assert.deepEqual(box.sent, ['tâche lourde'], 'resend only after an explicit click');
});

test('full mode page ships the relaunch module inside a script that parses', async () => {
  const response = await fullMode({ request: new Request('https://mel.example/full'), env: {} });
  const html = await response.text();
  assert.match(html, /function melInstallAutoRelaunch\(/);
  assert.match(html, /melInstallAutoRelaunch\(\);/);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const main = scripts.find(source => source.includes('melInstallAutoRelaunch'));
  assert.ok(main);
  assert.doesNotThrow(() => new vm.Script(main));
});

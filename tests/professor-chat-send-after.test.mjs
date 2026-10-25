import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { onRequestGet as professor } from '../src/pages/full-interface-v2.js';
import { onRequestGet as normal } from '../src/pages/mvp-interface-v3.js';

test('send-when-finished control exists only in Professor and its browser runtime parses', async () => {
  const html = await (await professor()).text();
  const normalHtml = await (await normal()).text();
  assert.match(html, /id="chatSendAfter"[^>]*type="button" disabled[^>]*>Envoyer quand terminé<\/button>/);
  assert.doesNotMatch(normalHtml, /id="chatSendAfter"/, 'Normal must remain unchanged');
  const runtime = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(runtime);
  assert.doesNotThrow(() => new Function(runtime));
  assert.match(runtime, /qs\('#chatSendAfter'\)\.addEventListener\('click',\(\)=>\{if\(chatActiveController\)void sendChat\(\)\}\)/);
});

test('Professor button reuses the FIFO queue, preserves the mode and sends after completion', async () => {
  const html = await (await professor()).text();
  const runtime = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  const start = runtime.indexOf('let chatActiveController=null;');
  const end = runtime.indexOf('async function executeChatTurn(', start);
  assert.ok(start >= 0 && end > start, 'canonical pending queue must remain in the Professor script');

  const nodes = new Map([
    ['#chatInput', { value: '' }],
    ['#chatPendingCount', { textContent: '' }],
    ['#chatSendAfter', { disabled: true }],
    ['#chatStatus', { textContent: '' }],
    ['#chatInterrupt', { disabled: false }],
    ['#melCodeContinue', { disabled: false }],
  ]);
  const inflight = [];
  const files = [];
  const context = vm.createContext({
    AbortController,
    Promise,
    qs: (selector) => nodes.get(selector) || null,
    melChatRole: 'code',
    melCodeLastRequest: 'first',
    executeChatTurn: (text, source, controller, role) => new Promise(resolve => inflight.push({ text, role, resolve })),
    pendingChatFiles: files,
    renderPendingChatFiles: () => {},
  });
  vm.runInContext(runtime.slice(start, end) + '\n globalThis.queueHarness={sendChat,chatQueueStatus};', context);
  const { sendChat } = context.queueHarness;

  const first = sendChat('premier', 'text', 'code');
  assert.equal(nodes.get('#chatSendAfter').disabled, false, 'button enabled only during generation');
  assert.equal(inflight.length, 1);
  nodes.get('#chatInput').value = 'suivant';
  await sendChat(); // The button invokes this same path while a turn is active.
  assert.equal(inflight.length, 1, 'no concurrent send');
  assert.equal(nodes.get('#chatInput').value, '');
  assert.match(nodes.get('#chatPendingCount').textContent, /1 message/);
  assert.match(nodes.get('#chatStatus').textContent, /fin de la réponse en cours/);

  inflight[0].resolve('ok');
  await first;
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(inflight.length, 2, 'queued turn starts only after first completion');
  assert.equal(inflight[1].text, 'suivant');
  assert.equal(inflight[1].role, 'code');
  assert.equal(nodes.get('#chatPendingCount').textContent, '');
  assert.equal(nodes.get('#chatSendAfter').disabled, false, 'button stays enabled while queued turn executes');

  inflight[1].resolve('ok');
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(nodes.get('#chatSendAfter').disabled, true, 'button disabled when the queue is idle');
});

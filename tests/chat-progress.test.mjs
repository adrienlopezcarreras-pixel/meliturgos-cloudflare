import test from 'node:test';
import assert from 'node:assert/strict';
import { withChatProgress, instrumentBus, capabilityLabel } from '../src/api/chat-progress.js';
import { melTraceModel } from '../src/pages/mel-chat-trace.js';

const env = { MELITURGOS_USER: 'adrien', MELITURGOS_PASSWORD: 'test' };
const auth = { authorization: 'Basic ' + Buffer.from('adrien:test').toString('base64'), 'content-type': 'application/json' };
const req = body => new Request('https://mel.test/api/chat', { method: 'POST', headers: auth, body: JSON.stringify(body) });
const events = async response => (await response.text()).split('\n').filter(Boolean).map(l => JSON.parse(l));

test('tool runs are streamed as progress, then a JSON answer keeps all its fields', async () => {
  const handler = async (_r, _e, options) => {
    const runtime = instrumentBus({ bus: { execute: async () => ({ sources: [1, 2, 3] }) } }, options.onProgress);
    await runtime.bus.execute('web.research', {});
    return Response.json({ ok: true, text: 'Voici.', model: '@cf/openai/gpt-oss-120b', tool_results: [{ capability: 'web.research', status: 'SUCCEEDED' }], approval_required: null, archive_saved: true });
  };
  const evs = await events(await withChatProgress(req({ text: 'cherche', stream: true }), env, {}, handler));
  const progress = evs.filter(e => e.type === 'progress');
  assert.deepEqual(progress.map(e => e.id + ':' + e.status), ['read:running', 'read:done', 'tool-1-web.research:running', 'tool-1-web.research:done', 'write:done']);
  assert.equal(progress[3].label, 'Recherche sur le web');
  assert.equal(progress[3].detail, '3 source(s)');
  assert.equal(evs.find(e => e.type === 'delta').text, 'Voici.');
  const done = evs.find(e => e.type === 'done');
  assert.deepEqual(done.result.tool_results, [{ capability: 'web.research', status: 'SUCCEEDED' }]);
  assert.equal(done.archived, true);
});

test('a streamed model answer is passed through with a writing step', async () => {
  const handler = async () => new Response('{"type":"start","model":"@cf/openai/gpt-oss-120b"}\n{"type":"delta","text":"Bon"}\n{"type":"done","model":"@cf/openai/gpt-oss-120b"}\n', { headers: { 'content-type': 'application/x-ndjson' } });
  const evs = await events(await withChatProgress(req({ text: 'salut', stream: true }), env, {}, handler));
  assert.deepEqual(evs.map(e => e.type + (e.id ? ':' + e.id + ':' + e.status : '')), ['progress:read:running', 'progress:read:done', 'progress:write:running', 'start', 'delta', 'progress:write:done', 'done']);
});

test('anonymous or non-stream requests are not wrapped', async () => {
  let called = 0;
  const handler = async () => { called++; return Response.json({ ok: true }); };
  const anon = await withChatProgress(new Request('https://mel.test/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"stream":true}' }), env, {}, handler);
  assert.equal(anon.status, 401);
  assert.equal(called, 0);
  const plain = await withChatProgress(req({ text: 'x' }), env, {}, handler);
  assert.equal(plain.headers.get('content-type').includes('json'), true);
  assert.equal(called, 1);
});

test('the trace shows Progression, Sorties and Utilisés from the live progress', () => {
  const t = melTraceModel({ model: '@cf/openai/gpt-oss-120b', computer_command: { command_id: 'c1' }, progress: [
    { id: 'read', kind: 'step', label: 'Je lis ta demande', status: 'done' },
    { id: 't1', kind: 'tool', tool: 'web.research', label: capabilityLabel('web.research'), status: 'done', detail: '4 source(s)' },
  ] });
  assert.deepEqual(t.progress, ['✓ Je lis ta demande', '✓ Recherche sur le web — 4 source(s)']);
  assert.deepEqual(t.used, ['Recherche sur le web', 'Modèle gpt-oss-120b']);
  assert.deepEqual(t.outputs, ['Commande PC c1']);
});

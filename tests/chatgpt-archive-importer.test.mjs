import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeChatGPTArchive } from '../src/persistence/chatgpt-archive-importer.js';
import worker from '../src/index.js';

const sample = [{
  id: 'conv-1',
  title: 'Projet MEL',
  create_time: 1700000000,
  mapping: {
    a: { id: 'a', parent: null, message: { id: 'm1', author: { role: 'user' }, create_time: 1700000001, content: { parts: ['Bonjour MEL'] } } },
    b: { id: 'b', parent: 'a', message: { id: 'm2', author: { role: 'assistant' }, create_time: 1700000002, content: { parts: ['Bonjour Adrien'] } } }
  }
}];

test('normalizer recognizes conversations.json mapping and preserves provenance-ready ids', () => {
  const out = normalizeChatGPTArchive(sample);
  assert.equal(out.summary.conversations, 1);
  assert.equal(out.summary.messages, 2);
  assert.equal(out.conversations[0].id, 'chatgpt:conv-1');
  assert.equal(out.conversations[0].messages[0].role, 'user');
  assert.equal(out.conversations[0].messages[1].content, 'Bonjour Adrien');
});

test('explicit archive endpoint supports safe preview without touching D1', async () => {
  const auth = 'Basic ' + Buffer.from('adrien:test').toString('base64');
  const request = new Request('https://mel.test/api/gen2/import/chatgpt-archive', {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify({ archive: sample, preview: true })
  });
  const response = await worker.fetch(request, { MELITURGOS_USER: 'adrien', MELITURGOS_PASSWORD: 'test' }, {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.preview, true);
  assert.equal(body.conversations, 1);
  assert.equal(body.messages, 2);
});

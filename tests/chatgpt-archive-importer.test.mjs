import test from 'node:test';
import assert from 'node:assert/strict';
import { getChatGPTImportStatus, importChatGPTArchive, normalizeChatGPTArchive } from '../src/persistence/chatgpt-archive-importer.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
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


test('ChatGPT import status is fail-closed when persistent DB is unavailable', async () => {
  const status = await getChatGPTImportStatus({});
  assert.equal(status.ok, false);
  assert.equal(status.status, 'UNAVAILABLE');
  assert.equal(status.db_bound, false);
  assert.equal(status.messages, 0);
});

test('authenticated ChatGPT import status endpoint exposes server-side ingestion state', async () => {
  const auth = 'Basic ' + Buffer.from('adrien:test').toString('base64');
  const request = new Request('https://mel.test/api/gen2/import/chatgpt-status', {
    method: 'GET',
    headers: { authorization: auth }
  });
  const response = await worker.fetch(request, { MELITURGOS_USER: 'adrien', MELITURGOS_PASSWORD: 'test' }, {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'UNAVAILABLE');
  assert.equal(body.db_bound, false);
});

test('server status distinguishes partial Collector receipts from a later complete capture', async () => {
  const DB = sqliteD1();
  try {
    const env = { DB, MELITURGOS_USER: 'adrien' };
    const partial = [{
      id: 'collector-completeness',
      title: 'Conversation longue',
      collector: { source: 'firefox_dom', version: '0.5.1', partial: true, totalMessages: 4 },
      messages: [
        { id: 'm3', role: 'user', content: 'troisième', timestamp: 3 },
        { id: 'm4', role: 'assistant', content: 'quatrième', timestamp: 4 },
      ],
    }];

    const first = await importChatGPTArchive(env, partial, { preview: false });
    assert.equal(first.conversations, 1);
    let status = await getChatGPTImportStatus(env);
    assert.equal(status.tracked_conversations, 1);
    assert.equal(status.complete_conversations, 0);
    assert.equal(status.partial_conversations, 1);
    assert.equal(status.unknown_completeness, 0);
    assert.equal(status.full_archive_confirmed, false);
    assert.equal(status.expected_messages, 4);

    const full = [{
      id: 'collector-completeness',
      title: 'Conversation longue',
      collector: { source: 'firefox_dom', version: '0.5.1', partial: false, totalMessages: 4 },
      messages: [
        { id: 'm1', role: 'user', content: 'premier', timestamp: 1 },
        { id: 'm2', role: 'assistant', content: 'deuxième', timestamp: 2 },
        { id: 'm3', role: 'user', content: 'troisième', timestamp: 3 },
        { id: 'm4', role: 'assistant', content: 'quatrième', timestamp: 4 },
      ],
    }];

    await importChatGPTArchive(env, full, { preview: false });
    status = await getChatGPTImportStatus(env);
    assert.equal(status.complete_conversations, 1);
    assert.equal(status.partial_conversations, 0);
    assert.equal(status.unknown_completeness, 0);
    assert.equal(status.full_archive_confirmed, true);
    assert.equal(status.expected_messages, 4);
  } finally {
    DB.close();
  }
});

test('a smaller later DOM snapshot cannot falsely downgrade expected Collector completeness', async () => {
  const DB = sqliteD1();
  try {
    const env = { DB, MELITURGOS_USER: 'adrien' };
    await importChatGPTArchive(env, [{
      id: 'collector-no-downgrade',
      title: 'Conversation incomplète',
      collector: { source: 'firefox_dom', version: '0.5.1', partial: true, totalMessages: 6 },
      messages: [
        { id: 'm5', role: 'user', content: 'cinquième', timestamp: 5 },
        { id: 'm6', role: 'assistant', content: 'sixième', timestamp: 6 },
      ],
    }], { preview: false });

    await importChatGPTArchive(env, [{
      id: 'collector-no-downgrade',
      title: 'Conversation incomplète',
      collector: { source: 'firefox_dom', version: '0.5.1', partial: false, totalMessages: 4 },
      messages: [
        { id: 'm1', role: 'user', content: 'premier', timestamp: 1 },
        { id: 'm2', role: 'assistant', content: 'deuxième', timestamp: 2 },
        { id: 'm3', role: 'user', content: 'troisième', timestamp: 3 },
        { id: 'm4', role: 'assistant', content: 'quatrième', timestamp: 4 },
      ],
    }], { preview: false });

    const status = await getChatGPTImportStatus(env);
    assert.equal(status.expected_messages, 6);
    assert.equal(status.complete_conversations, 0);
    assert.equal(status.partial_conversations, 1);
    assert.equal(status.full_archive_confirmed, false);
  } finally {
    DB.close();
  }
});

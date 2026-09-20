import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { importChatGPTArchive } from '../src/persistence/chatgpt-archive-importer.js';

const context = { owner: 'adrien', permissions: [], requestId: 'conversation-capability-test' };

test('Gen2 registers conversation and device runtime tools with truthful risk', () => {
  const runtime = createGen2Runtime({ env: {} });
  const byId = new Map(runtime.bus.list().map(row => [row.id, row]));
  for (const id of ['conversation.get','conversation.messages.list','device.sync','chatgpt.history.search']) {
    assert.equal(byId.get(id)?.risk, 'LOW', `${id} must stay read-only LOW risk`);
  }
  for (const id of ['conversation.create','conversation.update','conversation.archive','conversation.messages.add','device.register']) {
    assert.equal(byId.get(id)?.risk, 'MEDIUM', `${id} mutates persistent state`);
  }
});

test('conversation runtime tools fail closed when D1 is unavailable', async () => {
  const runtime = createGen2Runtime({ env: {} });
  await assert.rejects(
    runtime.bus.execute('conversation.get', { id: 'missing' }, context),
    error => error?.code === 'DB_BINDING_MISSING' && error?.status === 503,
  );
  await assert.rejects(
    runtime.bus.execute('device.sync', { deviceId: 'd1', conversationId: 'c1' }, context),
    error => error?.code === 'DB_BINDING_MISSING' && error?.status === 503,
  );
});

test('conversation REST and Gen2 storage routes execute through CapabilityBus only', async () => {
  const canonical = await readFile(new URL('../src/api/routes/conversations.js', import.meta.url), 'utf8');
  const router = await readFile(new URL('../src/router.js', import.meta.url), 'utf8');

  assert.doesNotMatch(canonical, /createConversationService/);
  assert.doesNotMatch(router, /createConversationService/);

  for (const id of ['conversation.list','conversation.get','conversation.create','conversation.update','conversation.archive','conversation.messages.list','conversation.messages.add','device.sync']) {
    assert.match(canonical, new RegExp(`bus\\.execute\\(['"]${id.replaceAll('.', '\\.')}`));
  }
  for (const id of ['conversation.list','conversation.messages.list','device.register','device.sync']) {
    assert.match(router, new RegExp(`bus\\.execute\\(['"]${id.replaceAll('.', '\\.')}`));
  }
});


test('chatgpt.history.search executes against Collector history with provenance', async () => {
  const DB = sqliteD1();
  try {
    await importChatGPTArchive({DB,MELITURGOS_USER:'adrien'}, [{
      id:'capability-collector-history',
      title:'Mémoire jeux',
      collector:{source:'firefox_dom',version:'0.2.0',partial:false,totalMessages:1},
      messages:[{id:'m1',role:'user',content:'Le prototype Godot doit commencer par une tranche verticale jouable.',timestamp:10}],
    }], {preview:false});
    const runtime = createGen2Runtime({ env:{DB,MELITURGOS_USER:'adrien'} });
    const result = await runtime.bus.execute('chatgpt.history.search', {query:'Godot tranche verticale',limit:5}, context);
    assert.equal(result.results[0].conversation_title,'Mémoire jeux');
    assert.equal(result.results[0].authority,'historical_user_message');
    assert.equal(result.results[0].provenance.collector_source,'firefox_dom');
  } finally { DB.close(); }
});

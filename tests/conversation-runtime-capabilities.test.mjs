import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';

const context = { owner: 'adrien', permissions: [], requestId: 'conversation-capability-test' };

test('Gen2 registers conversation and device runtime tools with truthful risk', () => {
  const runtime = createGen2Runtime({ env: {} });
  const byId = new Map(runtime.bus.list().map(row => [row.id, row]));
  for (const id of ['conversation.get','conversation.messages.list','device.sync']) {
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

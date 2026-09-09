import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../src/index.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';
import { createGen2Runtime } from '../../src/core/orchestrator/gen2-runtime.js';

const auth = { authorization: `Basic ${Buffer.from('test:test-only').toString('base64')}`, 'content-type': 'application/json' };
function makeEnv(calls = []) { return { DB: sqliteD1(), MELITURGOS_USER: 'test', MELITURGOS_PASSWORD: 'test-only', AI: { async run(model, input) { calls.push({ model, input }); return { response: 'mock assistant' }; } } }; }
const manifest = (id, risk = 'LOW') => ({ id, name: id, version: '1.0.0', description: 'integration extension', author: 'test', capabilities: [], permissions: [], secrets_required: [], dependencies: [], entrypoint: 'main.js', healthcheck: 'health', risk });

test('MEL chat archives before retrieval, injects memory and RAG, routes through ModelRouter, and archives response', async () => {
  const calls = []; const env = makeEnv(calls); const request = (body, id) => new Request('http://localhost/api/chat', { method: 'POST', headers: {...auth, 'x-conversation-id': id}, body: JSON.stringify({...body, conversation_id: id}) });
  try {
    assert.equal((await worker.fetch(request({ text: 'Souviens-toi que le projet Orion est prioritaire' }, 'a'), env)).status, 200);
    assert.equal((await worker.fetch(request({ text: 'Quel projet est prioritaire ?' }, 'b'), env)).status, 200);
    const last = calls.at(-1).input.messages;
    assert.ok(last[0].content.includes('projet Orion'));
    assert.ok(last[0].content.includes('RETRIEVED DATA'));
    assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM archive_messages').first()).n, 4);
    assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM memories').first()).n, 1);
  } finally { env.DB.close(); }
});

test('chat capability path crosses CapabilityBus and returns a tool result to ModelRouter', async () => {
  const calls = []; const env = makeEnv(calls); const body = { text: 'Echo this safely', conversation_id: 'tool-flow', capability: { id: 'echo', input: { value: 'safe-result' } } };
  try { const response = await worker.fetch(new Request('http://localhost/api/chat', { method: 'POST', headers: auth, body: JSON.stringify(body) }), env); assert.equal(response.status, 200); assert.ok(calls.at(-1).input.messages.some(m => m.role === 'tool' && m.content.includes('safe-result'))); } finally { env.DB.close(); }
});

test('plugin, module, Module Lab and agent mock runtimes execute through one CapabilityBus', async () => {
  const runtime = createGen2Runtime(); const context = { owner: 'runtime', permissions: [], requestId: crypto.randomUUID() };
  const plugin = runtime.plugins.register(manifest('mock-plugin'), async input => ({ value: input.value }));
  assert.equal(plugin.status, 'TESTED'); assert.deepEqual(await runtime.plugins.execute('mock-plugin', { value: 'plugin-ok' }, context), { value: 'plugin-ok' });
  const module = runtime.modules.register(manifest('mock-module'), async input => ({ value: input.value }));
  assert.equal(module.status, 'TESTED'); runtime.modules.activate('mock-module'); assert.deepEqual(await runtime.modules.run('mock-module', { value: 'module-ok' }, context), { value: 'module-ok' }); runtime.modules.rollback('mock-module');
  const lab = await runtime.moduleLab.prove(manifest('lab-module'), async input => ({ value: input.value })); assert.equal(lab.status, 'ACTIVE');
  runtime.agents.register('agent', [{ capability: 'echo', input: { value: 'agent-ok' } }]); assert.deepEqual((await runtime.agents.run('agent', context)).results, [{ value: 'agent-ok' }]);
});

test('device sync returns the same persisted message identity', async () => {
  const env = makeEnv(); const { ConversationService } = await import('../../src/conversations/conversation-service.js'); const service = new ConversationService(env.DB);
  try { await service.migrate(); await service.ensureConversation('sync-conversation', 'test', 'sync'); const saved = await service.archiveMessage({ conversationId: 'sync-conversation', deviceId: 'phone', role: 'user', content: 'same id' }); const sync = await service.getSyncMessages('desktop', 'sync-conversation'); assert.equal(sync.messages[0].id, saved.id); } finally { env.DB.close(); }
});

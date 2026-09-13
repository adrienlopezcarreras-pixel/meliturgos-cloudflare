import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';

const sample = [{
  id: 'conv-1',
  title: 'Projet MEL',
  messages: [{ id: 'm1', role: 'user', content: 'Bonjour MEL', timestamp: 1700000000000 }],
}];

test('ChatGPT archive persistent import is a MEDIUM-risk CapabilityBus tool', async () => {
  const runtime = createGen2Runtime({ env: {} });
  const capability = runtime.bus.list().find(row => row.id === 'chatgpt.archive.import');
  assert.equal(capability?.risk, 'MEDIUM');
  assert.equal(capability?.enabled, true);
  await assert.rejects(
    runtime.bus.execute('chatgpt.archive.import', { archive: sample }, { owner: 'test', permissions: [], requestId: 'archive-import-test' }),
    error => error?.code === 'DB_BINDING_REQUIRED' && error?.status === 503,
  );
});

test('ChatGPT archive HTTP routes delegate preview and persistent import through CapabilityBus', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /import\s*\{\s*importChatGPTArchive\s*\}/);
  assert.match(source, /preview \? 'chatgpt\.archive\.preview' : 'chatgpt\.archive\.import'/);
  assert.match(source, /runtime\.bus\.execute\(capabilityId, \{ archive \}, busContext\(env\)\)/);
});

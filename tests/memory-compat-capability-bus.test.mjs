import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';

test('memory status and export are LOW-risk CapabilityBus tools', async () => {
  const runtime = createGen2Runtime({ env: {} });
  const byId = new Map(runtime.bus.list().map(row => [row.id, row]));
  assert.equal(byId.get('memory.status')?.risk, 'LOW');
  assert.equal(byId.get('memory.export')?.risk, 'LOW');

  const context = { owner: 'test', permissions: [], requestId: 'memory-compat-test' };
  const status = await runtime.bus.execute('memory.status', {}, context);
  assert.equal(status.status, 'UNAVAILABLE');
  assert.equal(status.db_bound, false);
  const exported = await runtime.bus.execute('memory.export', {}, context);
  assert.equal(exported.format, 'meliturgos-memory-export');
  assert.deepEqual(exported.memories, []);
  assert.deepEqual(exported.conversations, []);
});

test('memory compatibility HTTP endpoints execute through CapabilityBus', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function maybeHandleMemoryCompatibility');
  const end = source.indexOf('\nfunction busContext', start);
  assert.notEqual(start, -1);
  const handler = source.slice(start, end);
  assert.match(handler, /runtime\.bus\.execute\('memory\.status'/);
  assert.match(handler, /runtime\.bus\.execute\('memory\.export'/);
  assert.doesNotMatch(handler, /safeCount\(/);
  assert.doesNotMatch(handler, /safeRows\(/);
});

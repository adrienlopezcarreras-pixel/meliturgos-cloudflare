import test from 'node:test';
import assert from 'node:assert/strict';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';

const context = { owner: 'test', permissions: [], requestId: 'autonomy-capability-test' };

test('Gen2 runtime exposes autonomy.status and autonomy.tick as real capabilities', () => {
  const runtime = createGen2Runtime({ env: {} });
  const rows = runtime.bus.list();
  const ids = new Set(rows.map((row) => row.id));
  assert.ok(ids.has('autonomy.status'));
  assert.ok(ids.has('autonomy.tick'));
  assert.ok(ids.has('evolution.enqueue'));
  assert.ok(ids.size >= 14, `expected expanded runtime capability set, got ${ids.size}`);
});

test('autonomy capabilities fail closed when required Cloudflare bindings are absent', async () => {
  const runtime = createGen2Runtime({ env: {} });
  await assert.rejects(
    () => runtime.bus.execute('autonomy.status', {}, context),
    (error) => error?.code === 'DB_BINDING_MISSING' || error?.message === 'DB_BINDING_MISSING',
  );
  await assert.rejects(
    () => runtime.bus.execute('autonomy.tick', {}, context),
    (error) => error?.code === 'DB_BINDING_MISSING' || error?.message === 'DB_BINDING_MISSING',
  );
});

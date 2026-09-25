import test from 'node:test';
import assert from 'node:assert/strict';

import { createGen2Runtime } from '../../src/core/orchestrator/gen2-runtime.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';

function manifest(version) {
  return {
    id: 'durable.echo',
    name: 'Durable Echo',
    version,
    description: 'Gen2 runtime durable plugin fixture',
    author: 'MEL',
    capabilities: ['execute'],
    permissions: [],
    secrets_required: [],
    dependencies: [],
    entrypoint: 'plugins/durable-echo.js',
    healthcheck: 'durable.echo.health',
    risk: 'LOW',
  };
}

function plugin(version) {
  return {
    manifest: manifest(version),
    capabilities: {
      execute: async input => ({ version, value: input.value }),
    },
    async activate() {},
    async deactivate() {},
  };
}

async function dbFixture() {
  const db = sqliteD1();
  await db.prepare(`CREATE TABLE plugins (
    id TEXT PRIMARY KEY,
    active_version TEXT,
    status TEXT NOT NULL DEFAULT 'DISCOVERED',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE plugin_versions (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    version TEXT NOT NULL,
    manifest TEXT NOT NULL,
    artifact_hash TEXT NOT NULL,
    proofs TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'DISCOVERED',
    created_at INTEGER NOT NULL,
    UNIQUE(plugin_id, version)
  )`).run();
  return db;
}

const context = version => ({
  owner: 'runtime',
  permissions: [],
  requestId: `plugin-${version}`,
  pluginProofs: {
    tests: true,
    sandbox: true,
    security: true,
    version,
  },
});

test('Gen2 runtime durable plugins use the canonical registry/runtime/loader and CapabilityBus path', async (t) => {
  const db = await dbFixture();
  t.after(() => db.close());
  const plugins = new Map([
    ['1.0.0', plugin('1.0.0')],
    ['2.0.0', plugin('2.0.0')],
  ]);
  const runtime = createGen2Runtime({
    env: {
      DB: db,
      MEL_PLUGIN_RESOLVER: async ({ version }) => plugins.get(version),
    },
  });

  assert.equal(runtime.plugins.durableAvailable, true);
  await runtime.plugins.installCandidate({
    manifest: manifest('1.0.0'),
    artifact_hash: 'sha256:1.0.0',
  });
  const activeV1 = await runtime.plugins.load(
    { plugin_id: 'durable.echo', version: '1.0.0' },
    context('1.0.0'),
  );
  assert.equal(activeV1.status, 'ACTIVE');
  assert.equal(runtime.bus.describe('plugin:durable.echo').version, '1.0.0');
  assert.deepEqual(
    await runtime.plugins.execute('durable.echo', { value: 'one' }, context('1.0.0')),
    { version: '1.0.0', value: 'one' },
  );

  await runtime.plugins.disable('durable.echo', context('1.0.0'));
  await runtime.plugins.installCandidate({
    manifest: manifest('2.0.0'),
    artifact_hash: 'sha256:2.0.0',
  });
  await runtime.plugins.load(
    { plugin_id: 'durable.echo', version: '2.0.0' },
    context('2.0.0'),
  );
  assert.equal(runtime.bus.describe('plugin:durable.echo').version, '2.0.0');

  const rolledBack = await runtime.plugins.rollback(
    { plugin_id: 'durable.echo', target_version: '1.0.0' },
    context('1.0.0'),
  );
  assert.equal(rolledBack.to_version, '1.0.0');
  assert.equal(runtime.bus.describe('plugin:durable.echo').version, '1.0.0');
  assert.deepEqual(
    await runtime.plugins.execute('durable.echo', { value: 'again' }, context('1.0.0')),
    { version: '1.0.0', value: 'again' },
  );
});

test('inline Gen2 plugins use the same canonical PluginRuntime without durable writes', async () => {
  const runtime = createGen2Runtime();
  const inline = {
    id: 'inline.echo',
    name: 'Inline Echo',
    version: '1.0.0',
    description: 'Inline compatibility fixture',
    author: 'test',
    capabilities: [],
    permissions: [],
    secrets_required: [],
    dependencies: [],
    entrypoint: 'inline.js',
    healthcheck: 'inline.health',
    risk: 'LOW',
  };

  const record = await runtime.plugins.register(inline, async input => ({ value: input.value }));
  assert.equal(record.status, 'ACTIVE');
  assert.deepEqual(
    await runtime.plugins.execute('inline.echo', { value: 'ok' }, { owner: 'test', permissions: [], requestId: 'inline' }),
    { value: 'ok' },
  );
});

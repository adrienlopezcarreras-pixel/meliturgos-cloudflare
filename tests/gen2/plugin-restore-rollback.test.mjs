import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createD1PluginRegistryAdapter,
  createPluginRuntime,
  createRegistry,
  createRegistryBackedPluginLoader,
} from '../../src/plugins/sdk.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';

function manifest(version) {
  return {
    id: 'mel.echo',
    name: 'Echo',
    version,
    description: 'Restore and rollback fixture',
    author: 'MEL',
    capabilities: ['echo'],
    permissions: ['plugin.echo'],
    secrets_required: [],
    dependencies: [],
    entrypoint: 'plugins/echo.js',
    healthcheck: 'echo.health',
    risk: 'LOW',
  };
}

function makePlugin(version) {
  const state = { activated: 0, deactivated: 0 };
  return {
    state,
    manifest: manifest(version),
    capabilities: { echo: async input => ({ version, value: input.value }) },
    async activate() { state.activated += 1; },
    async deactivate() { state.deactivated += 1; },
  };
}

async function registryDb() {
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

const permissions = { permissions: ['plugin.echo'] };
const proofs = version => ({
  tests: true,
  sandbox: true,
  security: true,
  version,
});

function resolver(plugins) {
  return async ({ version }) => plugins.get(version);
}

async function installAndActivate(loader, version) {
  await loader.installCandidate({
    manifest: manifest(version),
    artifact_hash: `sha256:${version}`,
  });
  return loader.load(
    { plugin_id: 'mel.echo', version },
    {
      ...permissions,
      pluginProofs: proofs(version),
    },
  );
}

test('ACTIVE plugin can be restored into a fresh runtime from the durable pointer', async (t) => {
  const db = await registryDb();
  t.after(() => db.close());
  const registry = createRegistry(createD1PluginRegistryAdapter(db));
  const firstPlugin = makePlugin('1.0.0');
  const plugins1 = new Map([['1.0.0', firstPlugin]]);
  const firstRuntime = createPluginRuntime({ registry });
  const firstLoader = createRegistryBackedPluginLoader({
    registry,
    runtime: firstRuntime,
    resolvePlugin: resolver(plugins1),
  });

  assert.equal((await installAndActivate(firstLoader, '1.0.0')).status, 'ACTIVE');

  const restoredPlugin = makePlugin('1.0.0');
  const secondRuntime = createPluginRuntime({ registry });
  const secondLoader = createRegistryBackedPluginLoader({
    registry,
    runtime: secondRuntime,
    resolvePlugin: resolver(new Map([['1.0.0', restoredPlugin]])),
  });

  const restored = await secondLoader.load(
    { plugin_id: 'mel.echo', version: '1.0.0', restore_active: true },
    permissions,
  );
  assert.equal(restored.status, 'ACTIVE');
  assert.equal(restoredPlugin.state.activated, 1);
  assert.equal((await secondLoader.health({ plugin_id: 'mel.echo' })).healthy, true);
});

test('restore artifact mismatch disables stale durable ACTIVE state instead of claiming success', async (t) => {
  const db = await registryDb();
  t.after(() => db.close());
  const registry = createRegistry(createD1PluginRegistryAdapter(db));
  const runtime1 = createPluginRuntime({ registry });
  const loader1 = createRegistryBackedPluginLoader({
    registry,
    runtime: runtime1,
    resolvePlugin: resolver(new Map([['1.0.0', makePlugin('1.0.0')]])),
  });
  await installAndActivate(loader1, '1.0.0');

  const runtime2 = createPluginRuntime({ registry });
  const loader2 = createRegistryBackedPluginLoader({
    registry,
    runtime: runtime2,
    resolvePlugin: resolver(new Map([['1.0.0', makePlugin('1.0.0')]])),
  });
  const restored = await runtime2.restore(makePlugin('1.0.0'), {
    ...permissions,
    pluginArtifactHash: 'sha256:wrong',
  });

  assert.equal(restored.status, 'FAILED');
  assert.equal(restored.error, 'PLUGIN_RESTORE_ARTIFACT_MISMATCH');
  assert.equal((await registry.get({ plugin_id: 'mel.echo' })).active_version, null);
  assert.equal((await loader2.health({ plugin_id: 'mel.echo' })).healthy, false);
});

test('rollback resolves target before disabling current version and activates the pinned target', async (t) => {
  const db = await registryDb();
  t.after(() => db.close());
  const registry = createRegistry(createD1PluginRegistryAdapter(db));
  const v1 = makePlugin('1.0.0');
  const v2 = makePlugin('2.0.0');
  const plugins = new Map([['1.0.0', v1], ['2.0.0', v2]]);
  const runtime = createPluginRuntime({ registry });
  const loader = createRegistryBackedPluginLoader({
    registry,
    runtime,
    resolvePlugin: resolver(plugins),
  });

  await installAndActivate(loader, '1.0.0');
  await loader.disable({ plugin_id: 'mel.echo' }, permissions);
  await installAndActivate(loader, '2.0.0');

  const rolledBack = await loader.rollback(
    { plugin_id: 'mel.echo', target_version: '1.0.0' },
    {
      ...permissions,
      pluginProofs: proofs('1.0.0'),
    },
  );

  assert.equal(rolledBack.from_version, '2.0.0');
  assert.equal(rolledBack.to_version, '1.0.0');
  assert.equal(rolledBack.active.status, 'ACTIVE');
  assert.equal(rolledBack.health.healthy, true);
  assert.equal(rolledBack.health.active_version, '1.0.0');
  assert.equal((await registry.get({ plugin_id: 'mel.echo', version: '2.0.0' })).status, 'DISABLED');
});

test('rollback target is validated before current ACTIVE version is disabled', async (t) => {
  const db = await registryDb();
  t.after(() => db.close());
  const registry = createRegistry(createD1PluginRegistryAdapter(db));
  const v1 = makePlugin('1.0.0');
  const v2 = makePlugin('2.0.0');
  const runtime = createPluginRuntime({ registry });
  const loader = createRegistryBackedPluginLoader({
    registry,
    runtime,
    resolvePlugin: async ({ version }) => version === '1.0.0' ? makePlugin('9.9.9') : v2,
  });

  await loader.installCandidate({ manifest: manifest('1.0.0'), artifact_hash: 'sha256:1.0.0' });
  await installAndActivate(loader, '2.0.0');

  await assert.rejects(
    () => loader.rollback(
      { plugin_id: 'mel.echo', target_version: '1.0.0' },
      { ...permissions, pluginProofs: proofs('1.0.0') },
    ),
    { code: 'PLUGIN_LOADER_ARTIFACT_MANIFEST_MISMATCH', status: 409 },
  );

  const root = await registry.get({ plugin_id: 'mel.echo' });
  assert.equal(root.active_version, '2.0.0');
  assert.equal(runtime.get('mel.echo').status, 'ACTIVE');
  assert.equal(runtime.get('mel.echo').version, '2.0.0');
});

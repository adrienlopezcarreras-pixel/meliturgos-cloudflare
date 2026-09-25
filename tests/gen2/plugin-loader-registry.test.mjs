import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createD1PluginRegistryAdapter,
  createPluginRuntime,
  createRegistry,
  createRegistryBackedPluginLoader,
} from '../../src/plugins/sdk.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';

function manifest(version = '1.0.0') {
  return {
    id: 'mel.echo',
    name: 'Echo',
    version,
    description: 'Registry-backed loader fixture',
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

function plugin(version = '1.0.0') {
  const state = { activated: 0, deactivated: 0 };
  return {
    state,
    manifest: manifest(version),
    capabilities: {
      echo: async input => ({ echoed: input.value }),
    },
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

function proofs(version = '1.0.0') {
  return {
    tests: true,
    sandbox: true,
    security: true,
    version,
  };
}

test('registry-backed loader installs an immutable candidate and loads only the pinned version', async (t) => {
  const db = await registryDb();
  t.after(() => db.close());
  const registry = createRegistry(createD1PluginRegistryAdapter(db));
  const runtime = createPluginRuntime({ registry });
  const resolved = plugin();
  const calls = [];
  const loader = createRegistryBackedPluginLoader({
    registry,
    runtime,
    resolvePlugin: async request => {
      calls.push(request);
      return resolved;
    },
  });

  const candidate = await loader.installCandidate({
    manifest: manifest(),
    artifact_hash: 'sha256:echo-v1',
  });
  assert.equal(candidate.status, 'CANDIDATE');

  await assert.rejects(
    () => loader.load({ plugin_id: 'mel.echo' }, { permissions: ['plugin.echo'], pluginProofs: proofs() }),
    { code: 'PLUGIN_LOADER_PINNED_VERSION_REQUIRED', status: 400 },
  );

  const active = await loader.load(
    { plugin_id: 'mel.echo', version: '1.0.0' },
    { permissions: ['plugin.echo'], pluginProofs: proofs() },
  );
  assert.equal(active.status, 'ACTIVE');
  assert.equal(resolved.state.activated, 1);
  assert.equal(calls[0].artifact_hash, 'sha256:echo-v1');
  assert.equal(calls[0].version, '1.0.0');

  assert.deepEqual(
    await loader.execute(
      { plugin_id: 'mel.echo', capability: 'echo', input: { value: 'bonjour' } },
      { permissions: ['plugin.echo'] },
    ),
    { echoed: 'bonjour' },
  );

  assert.deepEqual(await loader.health({ plugin_id: 'mel.echo' }), {
    plugin_id: 'mel.echo',
    healthy: true,
    durable_status: 'ACTIVE',
    active_version: '1.0.0',
    runtime_status: 'ACTIVE',
    runtime_version: '1.0.0',
  });
});

test('loader refuses a resolved artifact whose manifest does not match the pinned registry version', async (t) => {
  const db = await registryDb();
  t.after(() => db.close());
  const registry = createRegistry(createD1PluginRegistryAdapter(db));
  const runtime = createPluginRuntime({ registry });
  const loader = createRegistryBackedPluginLoader({
    registry,
    runtime,
    resolvePlugin: async () => plugin('2.0.0'),
  });

  await loader.installCandidate({
    manifest: manifest('1.0.0'),
    artifact_hash: 'sha256:echo-v1',
  });

  await assert.rejects(
    () => loader.load(
      { plugin_id: 'mel.echo', version: '1.0.0' },
      { permissions: ['plugin.echo'], pluginProofs: proofs('1.0.0') },
    ),
    { code: 'PLUGIN_LOADER_ARTIFACT_MANIFEST_MISMATCH', status: 409 },
  );
  assert.equal(runtime.get('mel.echo'), null);
  assert.equal((await registry.get({ plugin_id: 'mel.echo', version: '1.0.0' })).status, 'CANDIDATE');
});

test('loader disable reconciles runtime and durable state', async (t) => {
  const db = await registryDb();
  t.after(() => db.close());
  const registry = createRegistry(createD1PluginRegistryAdapter(db));
  const runtime = createPluginRuntime({ registry });
  const resolved = plugin();
  const loader = createRegistryBackedPluginLoader({
    registry,
    runtime,
    resolvePlugin: async () => resolved,
  });

  await loader.installCandidate({
    manifest: manifest(),
    artifact_hash: 'sha256:echo-v1',
  });
  await loader.load(
    { plugin_id: 'mel.echo', version: '1.0.0' },
    { permissions: ['plugin.echo'], pluginProofs: proofs() },
  );

  const status = await loader.disable(
    { plugin_id: 'mel.echo' },
    { permissions: ['plugin.echo'] },
  );
  assert.equal(resolved.state.deactivated, 1);
  assert.equal(status.healthy, false);
  assert.equal(status.durable_status, 'DISABLED');
  assert.equal(status.active_version, null);
  assert.equal(status.runtime_status, 'DISABLED');
});


import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createD1PluginRegistryAdapter,
  createPluginRuntime,
  createRegistry,
} from '../../src/plugins/sdk.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';

function manifest() {
  return {
    id: 'mel.echo',
    name: 'Echo',
    version: '1.0.0',
    description: 'Durable runtime fixture',
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

function plugin() {
  const state = { activated: 0, deactivated: 0 };
  return {
    state,
    manifest: manifest(),
    capabilities: {
      echo: async input => input,
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

const context = {
  permissions: ['plugin.echo'],
  pluginArtifactHash: 'sha256:echo-v1',
  pluginProofs: {
    tests: true,
    sandbox: true,
    security: true,
    version: '1.0.0',
  },
};

test('plugin runtime persists activation and deactivation through the durable registry', async (t) => {
  const db = await registryDb();
  t.after(() => db.close());
  const registry = createRegistry(createD1PluginRegistryAdapter(db));
  const runtime = createPluginRuntime({ registry });
  const candidate = plugin();

  const active = await runtime.register(candidate, context);
  assert.equal(active.status, 'ACTIVE');
  assert.equal(candidate.state.activated, 1);

  const root = await registry.get({ plugin_id: 'mel.echo' });
  assert.equal(root.status, 'ACTIVE');
  assert.equal(root.active_version, '1.0.0');

  const disabled = await runtime.deactivate('mel.echo', { permissions: ['plugin.echo'] });
  assert.equal(disabled.status, 'DISABLED');
  assert.equal(candidate.state.deactivated, 1);
  assert.equal((await registry.get({ plugin_id: 'mel.echo' })).active_version, null);
  assert.equal((await registry.get({ plugin_id: 'mel.echo', version: '1.0.0' })).status, 'DISABLED');
});

test('durable runtime rejects missing proof evidence before executing plugin activation', async (t) => {
  const db = await registryDb();
  t.after(() => db.close());
  const registry = createRegistry(createD1PluginRegistryAdapter(db));
  const runtime = createPluginRuntime({ registry });
  const candidate = plugin();

  const result = await runtime.register(candidate, {
    permissions: ['plugin.echo'],
    pluginArtifactHash: 'sha256:echo-v1',
    pluginProofs: {
      tests: false,
      sandbox: true,
      security: true,
      version: '1.0.0',
    },
  });

  assert.equal(result.status, 'FAILED');
  assert.equal(result.error, 'TEST_EVIDENCE_REQUIRED');
  assert.equal(candidate.state.activated, 0);
  assert.equal((await registry.get({ plugin_id: 'mel.echo', version: '1.0.0' })).status, 'FAILED');
});

test('runtime rolls back an activated plugin if durable ACTIVE persistence fails', async (t) => {
  const db = await registryDb();
  t.after(() => db.close());
  const baseRegistry = createRegistry(createD1PluginRegistryAdapter(db));
  const registry = {
    get: input => baseRegistry.get(input),
    disable: input => baseRegistry.disable(input),
    register: input => {
      if (input.status === 'ACTIVE') {
        const error = new Error('PERSIST_ACTIVE_FAILED');
        error.code = 'PERSIST_ACTIVE_FAILED';
        throw error;
      }
      return baseRegistry.register(input);
    },
  };
  const runtime = createPluginRuntime({ registry });
  const candidate = plugin();

  const result = await runtime.register(candidate, context);
  assert.equal(result.status, 'FAILED');
  assert.equal(result.error, 'PERSIST_ACTIVE_FAILED');
  assert.equal(candidate.state.activated, 1);
  assert.equal(candidate.state.deactivated, 1);
  assert.equal((await baseRegistry.get({ plugin_id: 'mel.echo', version: '1.0.0' })).status, 'FAILED');
});

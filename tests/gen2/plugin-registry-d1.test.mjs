import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createD1PluginRegistryAdapter,
  createRegistry,
} from '../../src/plugins/sdk.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';

function manifest(version = '1.0.0', overrides = {}) {
  return {
    id: 'mel.echo',
    name: 'Echo',
    version,
    description: 'Persistent plugin registry fixture',
    author: 'MEL',
    capabilities: ['echo'],
    permissions: ['plugin.echo'],
    secrets_required: [],
    dependencies: [],
    entrypoint: 'plugins/echo.js',
    healthcheck: 'echo.health',
    risk: 'LOW',
    ...overrides,
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

async function advanceToActive(registry, version = '1.0.0') {
  const base = {
    manifest: manifest(version),
    artifact_hash: `sha256:${version}`,
  };
  await registry.register({ ...base, status: 'DISCOVERED' });
  await registry.register({ ...base, status: 'VALIDATED' });
  await registry.register({ ...base, status: 'CANDIDATE' });
  await registry.register({
    ...base,
    status: 'TESTED',
    proofs: { tests: true, version },
  });
  return registry.register({
    ...base,
    status: 'ACTIVE',
    proofs: {
      tests: true,
      sandbox: true,
      security: true,
      activation: true,
      version,
    },
  });
}

test('D1 plugin registry persists a version across registry instances', async (t) => {
  const db = await registryDb();
  t.after(() => db.close());
  let clock = 1000;
  const adapter = createD1PluginRegistryAdapter(db, { now: () => ++clock });
  const registry = createRegistry(adapter);

  const discovered = await registry.register({
    manifest: manifest(),
    artifact_hash: 'sha256:v1',
    status: 'DISCOVERED',
  });
  assert.equal(discovered.status, 'DISCOVERED');

  const second = createRegistry(createD1PluginRegistryAdapter(db, { now: () => ++clock }));
  assert.equal((await second.get({ plugin_id: 'mel.echo', version: '1.0.0' })).artifact_hash, 'sha256:v1');
  assert.deepEqual((await second.list({ plugin_id: 'mel.echo' })).map(row => row.version), ['1.0.0']);
});

test('same plugin version is idempotent but immutable content conflicts fail closed', async (t) => {
  const db = await registryDb();
  t.after(() => db.close());
  const registry = createRegistry(createD1PluginRegistryAdapter(db));

  const input = {
    manifest: manifest(),
    artifact_hash: 'sha256:v1',
    status: 'DISCOVERED',
  };
  const first = await registry.register(input);
  const replay = await registry.register(input);
  assert.deepEqual(replay, first);

  await assert.rejects(
    () => registry.register({ ...input, artifact_hash: 'sha256:tampered' }),
    { code: 'PLUGIN_REGISTRY_VERSION_CONFLICT', status: 409 },
  );
  await assert.rejects(
    () => registry.register({
      manifest: manifest('2.0.0'),
      artifact_hash: 'sha256:v2',
      status: 'CANDIDATE',
    }),
    { code: 'PLUGIN_REGISTRY_INITIAL_STATE_INVALID', status: 409 },
  );
});

test('plugin lifecycle proof gates are enforced before activation', async (t) => {
  const db = await registryDb();
  t.after(() => db.close());
  const registry = createRegistry(createD1PluginRegistryAdapter(db));
  const base = { manifest: manifest(), artifact_hash: 'sha256:v1' };

  await registry.register({ ...base, status: 'DISCOVERED' });
  await registry.register({ ...base, status: 'VALIDATED' });
  await registry.register({ ...base, status: 'CANDIDATE' });

  await assert.rejects(
    () => registry.register({ ...base, status: 'TESTED', proofs: { tests: false, version: '1.0.0' } }),
    { code: 'TEST_EVIDENCE_REQUIRED', status: 409 },
  );

  await registry.register({ ...base, status: 'TESTED', proofs: { tests: true, version: '1.0.0' } });

  await assert.rejects(
    () => registry.register({
      ...base,
      status: 'ACTIVE',
      proofs: { tests: true, sandbox: true, security: true, version: '1.0.0' },
    }),
    { code: 'ACTIVATION_REQUIRED', status: 409 },
  );

  const active = await registry.register({
    ...base,
    status: 'ACTIVE',
    proofs: {
      tests: true,
      sandbox: true,
      security: true,
      activation: true,
      version: '1.0.0',
    },
  });
  assert.equal(active.status, 'ACTIVE');
  const root = await registry.get({ plugin_id: 'mel.echo' });
  assert.equal(root.status, 'ACTIVE');
  assert.equal(root.active_version, '1.0.0');
  assert.equal(root.active.status, 'ACTIVE');
});

test('disable clears the active pointer and preserves version history', async (t) => {
  const db = await registryDb();
  t.after(() => db.close());
  const registry = createRegistry(createD1PluginRegistryAdapter(db));

  await advanceToActive(registry);
  const disabled = await registry.disable({ plugin_id: 'mel.echo' });
  assert.equal(disabled.status, 'DISABLED');

  const root = await registry.get({ plugin_id: 'mel.echo' });
  assert.equal(root.status, 'DISABLED');
  assert.equal(root.active_version, null);
  assert.equal(root.active, null);
  assert.deepEqual(
    (await registry.list({ status: 'DISABLED' })).map(row => [row.plugin_id, row.version]),
    [['mel.echo', '1.0.0']],
  );
});

test('corrupt persisted manifest fails closed instead of being treated as a valid plugin', async (t) => {
  const db = await registryDb();
  t.after(() => db.close());
  await db.prepare(`INSERT INTO plugins(id, active_version, status, created_at, updated_at)
    VALUES (?, NULL, 'DISCOVERED', 1, 1)`).bind('mel.echo').run();
  await db.prepare(`INSERT INTO plugin_versions(
    id, plugin_id, version, manifest, artifact_hash, proofs, status, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    'mel.echo@1.0.0',
    'mel.echo',
    '1.0.0',
    '{broken',
    'sha256:v1',
    '{}',
    'DISCOVERED',
    1,
  ).run();

  const registry = createRegistry(createD1PluginRegistryAdapter(db));
  await assert.rejects(
    () => registry.get({ plugin_id: 'mel.echo', version: '1.0.0' }),
    { code: 'PLUGIN_REGISTRY_MANIFEST_CORRUPT', status: 500 },
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { validateManifest, createPluginControlPlane } from '../../src/plugins/sdk.js';

function manifest(overrides = {}) {
  return {
    id: 'mel.fixture',
    name: 'Fixture',
    version: '1.0.0',
    description: 'Plugin contract fixture',
    author: 'MEL',
    capabilities: ['fixture.echo'],
    permissions: ['memory.read'],
    secrets_required: [],
    dependencies: [],
    entrypoint: 'plugins/fixture.js',
    healthcheck: 'fixture.health',
    risk: 'LOW',
    ...overrides,
  };
}

class MemoryStore {
  constructor() { this.versions = new Map(); this.active = new Map(); }
  key(id, version) { return id + '@' + version; }
  async putVersion(record, { createOnly = false } = {}) {
    const key = this.key(record.plugin_id, record.version);
    if (createOnly && this.versions.has(key)) throw Object.assign(new Error('PLUGIN_VERSION_EXISTS'), { code:'PLUGIN_VERSION_EXISTS' });
    this.versions.set(key, structuredClone(record));
    return this.getVersion(record.plugin_id, record.version);
  }
  async getVersion(id, version) {
    const row = this.versions.get(this.key(id, version));
    return row ? structuredClone(row) : null;
  }
  async listVersions(id) {
    return [...this.versions.values()].filter(row => row.plugin_id === id).map(row => structuredClone(row));
  }
  async getActive(id) {
    const row = this.active.get(id);
    return row ? structuredClone(row) : null;
  }
  async setActive(id, version, metadata = {}) {
    const row = { plugin_id:id, version, ...structuredClone(metadata) };
    this.active.set(id, row);
    return structuredClone(row);
  }
  async clearActive(id) { const row = this.active.get(id) || null; this.active.delete(id); return structuredClone(row); }
}

test('manifest contract normalizes safe arrays and rejects duplicate permissions/capabilities', () => {
  const valid = validateManifest(manifest({
    capabilities: ['fixture.echo', 'fixture.read'],
    permissions: ['memory.read', 'plugin.execute'],
  }));
  assert.deepEqual(valid.capabilities, ['fixture.echo', 'fixture.read']);
  assert.deepEqual(valid.permissions, ['memory.read', 'plugin.execute']);

  assert.throws(
    () => validateManifest(manifest({ permissions: ['memory.read', 'memory.read'] })),
    error => error?.code === 'INVALID_PERMISSION_DUPLICATE',
  );
  assert.throws(
    () => validateManifest(manifest({ capabilities: ['fixture.echo', 'fixture.echo'] })),
    error => error?.code === 'INVALID_CAPABILITY_DUPLICATE',
  );
});

test('manifest contract rejects underdeclared risk for wildcard or secret access', () => {
  assert.throws(
    () => validateManifest(manifest({ permissions: ['*'], risk: 'LOW' })),
    error => error?.code === 'PLUGIN_RISK_UNDERDECLARED',
  );
  assert.throws(
    () => validateManifest(manifest({ secrets_required: ['GITHUB_TOKEN'], risk: 'LOW' })),
    error => error?.code === 'PLUGIN_RISK_UNDERDECLARED',
  );
  assert.equal(validateManifest(manifest({ permissions: ['*'], risk: 'HIGH' })).risk, 'HIGH');
});

test('manifest contract rejects traversal, malformed permission and invalid secret references', () => {
  assert.throws(() => validateManifest(manifest({ entrypoint: '../escape.js' })), error => error?.code === 'INVALID_ENTRYPOINT');
  assert.throws(() => validateManifest(manifest({ permissions: ['memory read'] })), error => error?.code === 'INVALID_PERMISSION');
  assert.throws(() => validateManifest(manifest({ secrets_required: ['github-token'], risk:'HIGH' })), error => error?.code === 'INVALID_SECRET_REFERENCE');
});

test('public SDK exposes durable control plane without conflating it with executable runtime', async () => {
  let now = 1_000;
  const control = createPluginControlPlane({ store: new MemoryStore(), now: () => ++now });
  assert.equal(typeof control.installCandidate, 'function');
  assert.equal(typeof control.activate, 'function');
  assert.equal(typeof control.rollback, 'function');
  assert.equal('execute' in control, false);

  const candidate = await control.installCandidate({
    manifest: manifest(),
    artifactRef: 'r2://plugins/mel.fixture/1.0.0.zip',
  });
  assert.equal(candidate.status, 'CANDIDATE');

  const health = await control.health({ pluginId: 'mel.fixture' });
  assert.deepEqual(health, {
    plugin_id: 'mel.fixture',
    active_version: null,
    active_status: null,
    versions: 1,
    healthy: false,
  });
});
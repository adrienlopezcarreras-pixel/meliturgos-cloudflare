import test from 'node:test';
import assert from 'node:assert/strict';

import { PluginVersionManager } from '../../src/plugins/version-manager.js';

function manifest(version, overrides = {}) {
  return {
    id: 'fixture.plugin',
    name: 'Fixture Plugin',
    version,
    description: 'Test plugin lifecycle',
    author: 'MEL tests',
    capabilities: ['fixture.echo'],
    permissions: ['memory.read'],
    secrets_required: [],
    dependencies: [],
    entrypoint: 'plugin/index.js',
    healthcheck: 'plugin/health.js',
    risk: 'LOW',
    ...overrides,
  };
}

function testProof(version) {
  return {
    tests: true,
    version,
    suite: 'plugin-contract-v1',
    run_id: `run-${version}`,
  };
}

function releaseProof(version, seed = 'a') {
  return {
    tests: true,
    sandbox: true,
    security: true,
    activation: true,
    version,
    artifact_digest: 'sha256:' + seed.repeat(64),
    source_sha: seed.repeat(40),
    approval_id: `approval-${version}`,
  };
}

class MemoryVersionStore {
  constructor() {
    this.versions = new Map();
    this.active = new Map();
    this.history = [];
  }
  key(id, version) { return `${id}@${version}`; }
  async putVersion(record, { createOnly = false } = {}) {
    const key = this.key(record.plugin_id, record.version);
    if (createOnly && this.versions.has(key)) {
      const error = new Error('PLUGIN_VERSION_EXISTS');
      error.code = 'PLUGIN_VERSION_EXISTS';
      throw error;
    }
    this.versions.set(key, structuredClone(record));
    return this.getVersion(record.plugin_id, record.version);
  }
  async getVersion(id, version) {
    const row = this.versions.get(this.key(id, version));
    return row ? structuredClone(row) : null;
  }
  async listVersions(id) {
    return [...this.versions.values()]
      .filter(row => row.plugin_id === id)
      .sort((a,b) => a.created_at - b.created_at || a.version.localeCompare(b.version))
      .map(row => structuredClone(row));
  }
  async getActive(id) {
    const row = this.active.get(id);
    if (!row) return null;
    return { ...structuredClone(row), record: await this.getVersion(id, row.version) };
  }
  async setActive(id, version, data = {}) {
    const row = { plugin_id: id, version, ...structuredClone(data) };
    this.active.set(id, row);
    this.history.push({ action: 'ACTIVATE', plugin_id: id, version, ...structuredClone(data) });
    return this.getActive(id);
  }
  async clearActive(id) {
    const previous = await this.getActive(id);
    this.active.delete(id);
    if (previous) this.history.push({ action: 'CLEAR_ACTIVE', plugin_id: id, version: previous.version });
    return previous;
  }
}

test('candidate installation stores manifest identity but never activates it', async () => {
  let now = 1_000;
  const store = new MemoryVersionStore();
  const manager = new PluginVersionManager(store, { now: () => now });

  const candidate = await manager.installCandidate({
    manifest: manifest('1.0.0'),
    artifactRef: 'r2://plugins/fixture/1.0.0.zip',
    metadata: { origin: 'module-lab' },
  });

  assert.equal(candidate.status, 'CANDIDATE');
  assert.equal(candidate.plugin_id, 'fixture.plugin');
  assert.equal(candidate.version, '1.0.0');
  assert.equal(candidate.artifact_digest, null);
  assert.equal(await manager.get('fixture.plugin'), null);
  assert.equal(store.history.length, 0);
});

test('testing and activation require exact server-owned evidence for the same version', async () => {
  let now = 1_000;
  const store = new MemoryVersionStore();
  const manager = new PluginVersionManager(store, { now: () => now });

  await manager.installCandidate({
    manifest: manifest('1.0.0'),
    artifactRef: 'r2://plugins/fixture/1.0.0.zip',
  });

  await assert.rejects(
    () => manager.markTested('fixture.plugin', '1.0.0', { ...testProof('1.0.1') }),
    error => error?.code === 'PLUGIN_TEST_VERSION_MISMATCH',
  );

  now = 2_000;
  const tested = await manager.markTested('fixture.plugin', '1.0.0', testProof('1.0.0'));
  assert.equal(tested.status, 'TESTED');

  await assert.rejects(
    () => manager.activate('fixture.plugin', '1.0.0', {
      ...releaseProof('1.0.0'),
      sandbox: false,
    }),
    error => error?.code === 'PLUGIN_RELEASE_EVIDENCE_REQUIRED',
  );

  now = 3_000;
  const activated = await manager.activate('fixture.plugin', '1.0.0', releaseProof('1.0.0'));
  assert.equal(activated.active.status, 'ACTIVE');
  assert.equal(activated.active.artifact_digest, releaseProof('1.0.0').artifact_digest);
  assert.equal((await manager.get('fixture.plugin')).version, '1.0.0');
});

test('activating a new version disables the previous one and keeps both histories', async () => {
  let now = 1_000;
  const store = new MemoryVersionStore();
  const manager = new PluginVersionManager(store, { now: () => ++now });

  for (const version of ['1.0.0', '1.1.0']) {
    await manager.installCandidate({
      manifest: manifest(version),
      artifactRef: `r2://plugins/fixture/${version}.zip`,
    });
    await manager.markTested('fixture.plugin', version, testProof(version));
    await manager.activate('fixture.plugin', version, releaseProof(version, version === '1.0.0' ? 'a' : 'b'));
  }

  const versions = await manager.list('fixture.plugin');
  const v1 = versions.find(row => row.version === '1.0.0');
  const v2 = versions.find(row => row.version === '1.1.0');

  assert.equal(v1.status, 'DISABLED');
  assert.equal(v2.status, 'ACTIVE');
  assert.equal((await manager.get('fixture.plugin')).version, '1.1.0');
  assert.equal(store.history.filter(row => row.action === 'ACTIVATE').length, 2);
});

test('rollback reactivates only a previously verified version through canonical lifecycle', async () => {
  let now = 10_000;
  const store = new MemoryVersionStore();
  const manager = new PluginVersionManager(store, { now: () => ++now });

  await manager.installCandidate({
    manifest: manifest('1.0.0'),
    artifactRef: 'r2://plugins/fixture/1.0.0.zip',
  });
  await manager.markTested('fixture.plugin', '1.0.0', testProof('1.0.0'));
  await manager.activate('fixture.plugin', '1.0.0', releaseProof('1.0.0', 'a'));

  await manager.installCandidate({
    manifest: manifest('2.0.0'),
    artifactRef: 'r2://plugins/fixture/2.0.0.zip',
  });
  await manager.markTested('fixture.plugin', '2.0.0', testProof('2.0.0'));
  await manager.activate('fixture.plugin', '2.0.0', releaseProof('2.0.0', 'b'));

  const result = await manager.rollback('fixture.plugin', '1.0.0', {
    approval_id: 'rollback-approval',
  });

  assert.equal(result.rolled_back_from.version, '2.0.0');
  assert.equal(result.rolled_back_from.status, 'ROLLED_BACK');
  assert.equal(result.restored.version, '1.0.0');
  assert.equal(result.restored.status, 'ACTIVE');
  assert.equal((await manager.get('fixture.plugin')).version, '1.0.0');

  const v2 = await manager.get('fixture.plugin', '2.0.0');
  assert.equal(v2.status, 'ROLLED_BACK');
});

test('rollback refuses an unverified target even if a row exists', async () => {
  const store = new MemoryVersionStore();
  const manager = new PluginVersionManager(store);

  await manager.installCandidate({
    manifest: manifest('1.0.0'),
    artifactRef: 'r2://plugins/fixture/1.0.0.zip',
  });
  await manager.markTested('fixture.plugin', '1.0.0', testProof('1.0.0'));
  await manager.activate('fixture.plugin', '1.0.0', releaseProof('1.0.0'));

  await manager.installCandidate({
    manifest: manifest('0.9.0'),
    artifactRef: 'r2://plugins/fixture/0.9.0.zip',
  });

  // Force a disabled-looking row with no prior release evidence to prove the
  // rollback guard does not trust status text alone.
  const row = await store.getVersion('fixture.plugin', '0.9.0');
  row.status = 'DISABLED';
  await store.putVersion(row);

  await assert.rejects(
    () => manager.rollback('fixture.plugin', '0.9.0', { approval_id: 'rollback' }),
    error => error?.code === 'PLUGIN_ROLLBACK_TARGET_UNVERIFIED',
  );
});

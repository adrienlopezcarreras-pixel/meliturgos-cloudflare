import test from 'node:test';
import assert from 'node:assert/strict';

import { D1PluginVersionStore } from '../../src/plugins/d1-version-store.js';
import { createPluginControlPlane } from '../../src/plugins/sdk.js';

function normalize(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = normalize(sql);
    this.args = [];
  }
  bind(...args) {
    this.args = args;
    return this;
  }

  async run() {
    const sql = this.sql;
    if (sql.startsWith('CREATE TABLE') || sql.startsWith('CREATE INDEX')) {
      return { success: true, meta: { changes: 0 } };
    }

    if (sql.startsWith('INSERT INTO plugin_versions')) {
      const [
        plugin_id, version, status, manifest_json, manifest_sha256, artifact_ref,
        artifact_digest, evidence_json, created_at, updated_at,
      ] = this.args;
      const key = `${plugin_id}@${version}`;
      if (this.db.versions.has(key)) throw new Error('SQLITE_CONSTRAINT_PRIMARYKEY');
      this.db.versions.set(key, {
        plugin_id, version, status, manifest_json, manifest_sha256, artifact_ref,
        artifact_digest, evidence_json, created_at, updated_at,
      });
      return { success: true, meta: { changes: 1 } };
    }

    if (sql.startsWith('UPDATE plugin_versions SET')) {
      const [
        status, manifest_json, manifest_sha256, artifact_digest, evidence_json,
        updated_at, plugin_id, version,
      ] = this.args;
      const key = `${plugin_id}@${version}`;
      const row = this.db.versions.get(key);
      if (!row) return { success: true, meta: { changes: 0 } };
      Object.assign(row, {
        status, manifest_json, manifest_sha256, artifact_digest, evidence_json, updated_at,
      });
      return { success: true, meta: { changes: 1 } };
    }

    if (sql.startsWith('INSERT INTO plugin_active_versions')) {
      const [plugin_id, version, activated_at, previous_version] = this.args;
      this.db.active.set(plugin_id, { plugin_id, version, activated_at, previous_version });
      return { success: true, meta: { changes: 1 } };
    }

    if (sql.startsWith('DELETE FROM plugin_active_versions')) {
      const existed = this.db.active.delete(this.args[0]);
      return { success: true, meta: { changes: existed ? 1 : 0 } };
    }

    if (sql.startsWith('INSERT INTO plugin_activation_history')) {
      const [plugin_id, version, action, occurred_at, previous_version] = this.args;
      this.db.history.push({
        sequence: ++this.db.sequence,
        plugin_id, version, action, occurred_at, previous_version,
      });
      return { success: true, meta: { changes: 1 } };
    }

    throw new Error(`UNEXPECTED_SQL_RUN:${sql}`);
  }

  async first() {
    if (this.sql === 'SELECT * FROM plugin_versions WHERE plugin_id=? AND version=?') {
      const row = this.db.versions.get(`${this.args[0]}@${this.args[1]}`);
      return row ? structuredClone(row) : null;
    }
    if (this.sql.startsWith('SELECT plugin_id,version,activated_at,previous_version FROM plugin_active_versions')) {
      const row = this.db.active.get(this.args[0]);
      return row ? structuredClone(row) : null;
    }
    throw new Error(`UNEXPECTED_SQL_FIRST:${this.sql}`);
  }

  async all() {
    if (this.sql.startsWith('SELECT * FROM plugin_versions WHERE plugin_id=?')) {
      const id = this.args[0];
      const rows = [...this.db.versions.values()]
        .filter(row => row.plugin_id === id)
        .sort((a,b) => a.created_at - b.created_at || a.version.localeCompare(b.version));
      return { results: structuredClone(rows) };
    }

    if (this.sql.includes('FROM plugin_activation_history')) {
      const [id, limit] = this.args;
      return {
        results: structuredClone(
          this.db.history.filter(row => row.plugin_id === id).slice(0, limit)
        ),
      };
    }
    throw new Error(`UNEXPECTED_SQL_ALL:${this.sql}`);
  }
}

class FakeD1 {
  constructor() {
    this.versions = new Map();
    this.active = new Map();
    this.history = [];
    this.sequence = 0;
  }
  prepare(sql) {
    return new FakeStatement(this, sql);
  }
}

function manifest(version = '1.0.0') {
  return {
    id: 'fixture.plugin',
    name: 'Fixture Plugin',
    version,
    description: 'Fixture',
    author: 'tests',
    capabilities: ['fixture.echo'],
    permissions: ['memory.read'],
    secrets_required: [],
    dependencies: [],
    entrypoint: 'plugin/index.js',
    healthcheck: 'plugin/health.js',
    risk: 'LOW',
  };
}

function record(version = '1.0.0', overrides = {}) {
  return {
    plugin_id: 'fixture.plugin',
    version,
    status: 'CANDIDATE',
    manifest: manifest(version),
    artifact_ref: `r2://plugins/fixture/${version}.zip`,
    artifact_digest: null,
    evidence: { metadata: { fixture: true } },
    created_at: 1_000,
    updated_at: 1_000,
    ...overrides,
  };
}

test('D1 plugin version store survives adapter recreation', async () => {
  const db = new FakeD1();
  const first = new D1PluginVersionStore(db);
  await first.putVersion(record(), { createOnly: true });

  const second = new D1PluginVersionStore(db);
  const restored = await second.getVersion('fixture.plugin', '1.0.0');

  assert.equal(restored.plugin_id, 'fixture.plugin');
  assert.equal(restored.version, '1.0.0');
  assert.equal(restored.status, 'CANDIDATE');
  assert.equal(restored.manifest.entrypoint, 'plugin/index.js');
  assert.deepEqual(restored.evidence.metadata, { fixture: true });
});

test('D1 plugin store rejects duplicate immutable version creation', async () => {
  const db = new FakeD1();
  const store = new D1PluginVersionStore(db);
  await store.putVersion(record(), { createOnly: true });

  await assert.rejects(
    () => store.putVersion(record('1.0.0', { artifact_ref: 'r2://other.zip' }), { createOnly: true }),
    error => error?.code === 'PLUGIN_VERSION_EXISTS' && error?.status === 409,
  );
});

test('D1 plugin store detects manifest tampering by checksum', async () => {
  const db = new FakeD1();
  const store = new D1PluginVersionStore(db);
  await store.putVersion(record(), { createOnly: true });

  const raw = db.versions.get('fixture.plugin@1.0.0');
  raw.manifest_json = raw.manifest_json.replace('Fixture Plugin', 'Tampered Plugin');

  const restarted = new D1PluginVersionStore(db);
  await assert.rejects(
    () => restarted.getVersion('fixture.plugin', '1.0.0'),
    error => error?.code === 'PLUGIN_MANIFEST_CHECKSUM_MISMATCH',
  );
});

test('D1 plugin store maintains one active version and durable activation history', async () => {
  const db = new FakeD1();
  const store = new D1PluginVersionStore(db);

  await store.putVersion(record('1.0.0', {
    status: 'ACTIVE',
    artifact_digest: 'sha256:' + 'a'.repeat(64),
  }), { createOnly: true });

  await store.setActive('fixture.plugin', '1.0.0', {
    activated_at: 2_000,
    previous_version: null,
  });

  let active = await store.getActive('fixture.plugin');
  assert.equal(active.version, '1.0.0');
  assert.equal(active.record.status, 'ACTIVE');

  await store.clearActive('fixture.plugin', { at: 3_000 });
  active = await store.getActive('fixture.plugin');
  assert.equal(active, null);

  const history = await new D1PluginVersionStore(db).activationHistory('fixture.plugin');
  assert.deepEqual(history.map(row => row.action), ['ACTIVATE', 'CLEAR_ACTIVE']);
  assert.deepEqual(history.map(row => row.occurred_at), [2_000, 3_000]);
});

test('D1 plugin store refuses to activate a record whose lifecycle state is not ACTIVE', async () => {
  const db = new FakeD1();
  const store = new D1PluginVersionStore(db);
  await store.putVersion(record(), { createOnly: true });

  await assert.rejects(
    () => store.setActive('fixture.plugin', '1.0.0'),
    error => error?.code === 'PLUGIN_ACTIVE_RECORD_REQUIRED',
  );
});


test('D1 plugin store keeps manifest and artifact identity immutable after version creation', async () => {
  const db = new FakeD1();
  const store = new D1PluginVersionStore(db);
  await store.putVersion(record(), { createOnly: true });

  const changedManifest = record('1.0.0', {
    status: 'TESTED',
    manifest: manifest('1.0.0'),
    updated_at: 2_000,
  });
  changedManifest.manifest.description = 'Silently changed contract';

  await assert.rejects(
    () => store.putVersion(changedManifest),
    error => error?.code === 'PLUGIN_VERSION_IMMUTABLE_IDENTITY_MISMATCH',
  );

  const activated = record('1.0.0', {
    status: 'ACTIVE',
    artifact_digest: 'sha256:' + 'a'.repeat(64),
    updated_at: 3_000,
  });
  await store.putVersion(activated);

  await assert.rejects(
    () => store.putVersion({
      ...activated,
      artifact_digest: 'sha256:' + 'b'.repeat(64),
      updated_at: 4_000,
    }),
    error => error?.code === 'PLUGIN_ARTIFACT_DIGEST_IMMUTABLE',
  );
});


test('GEN2-15 control plane survives recreation with exact-SHA activation evidence', async () => {
  const db = new FakeD1();
  let now = 10_000;
  const version = '2.0.0';
  const sourceSha = 'c'.repeat(40);
  const artifactDigest = 'sha256:' + 'd'.repeat(64);

  const first = createPluginControlPlane({ db, now: () => ++now });
  await first.installCandidate({
    manifest: manifest(version),
    artifactRef: 'r2://plugins/fixture/2.0.0.zip',
    metadata: { source: 'gen2-15-runtime-proof' },
  });
  await first.markTested({
    pluginId: 'fixture.plugin',
    version,
    proofs: {
      tests: true,
      version,
      suite: 'plugin-control-plane-runtime-v1',
      run_id: 'run-gen2-15-runtime-proof',
    },
  });
  const activated = await first.activate({
    pluginId: 'fixture.plugin',
    version,
    proofs: {
      tests: true,
      sandbox: true,
      security: true,
      activation: true,
      version,
      artifact_digest: artifactDigest,
      source_sha: sourceSha,
      approval_id: 'approval-gen2-15-runtime-proof',
    },
  });

  assert.equal(activated.active.status, 'ACTIVE');
  assert.equal(activated.active.evidence.release.source_sha, sourceSha);
  assert.equal(activated.active.artifact_digest, artifactDigest);

  const restarted = createPluginControlPlane({ db, now: () => ++now });
  const restored = await restarted.load({ pluginId: 'fixture.plugin' });
  const health = await restarted.health({ pluginId: 'fixture.plugin' });

  assert.equal(restored.version, version);
  assert.equal(restored.status, 'ACTIVE');
  assert.equal(restored.evidence.release.source_sha, sourceSha);
  assert.equal(restored.artifact_digest, artifactDigest);
  assert.equal(health.active_version, version);
  assert.equal(health.active_status, 'ACTIVE');
  assert.equal(health.healthy, true);
  assert.equal(health.versions, 1);
});

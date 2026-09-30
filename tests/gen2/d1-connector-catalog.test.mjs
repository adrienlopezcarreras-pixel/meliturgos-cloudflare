import test from 'node:test';
import assert from 'node:assert/strict';

import {
  D1ConnectorCatalogStore,
  PersistentConnectorCatalog,
} from '../../src/connectors/d1-connector-catalog.js';

function compact(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = compact(sql);
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  async run() {
    const sql = this.sql;
    if (sql.startsWith('CREATE TABLE')) {
      return { success: true, meta: { changes: 0 } };
    }

    if (sql.startsWith('INSERT INTO mel_connector_catalogs')) {
      const [owner, schema_version, snapshot_json, checksum_sha256, revision, updated_at] = this.args;
      if (this.db.rows.has(owner)) throw new Error('SQLITE_CONSTRAINT_PRIMARYKEY');
      this.db.rows.set(owner, {
        owner, schema_version, snapshot_json, checksum_sha256, revision, updated_at,
      });
      return { success: true, meta: { changes: 1 } };
    }

    if (sql.startsWith('UPDATE mel_connector_catalogs SET')) {
      const [
        schema_version, snapshot_json, checksum_sha256, revision, updated_at,
        owner, expectedChecksum,
      ] = this.args;
      const row = this.db.rows.get(owner);
      if (!row || row.checksum_sha256 !== expectedChecksum) {
        return { success: true, meta: { changes: 0 } };
      }
      Object.assign(row, {
        schema_version, snapshot_json, checksum_sha256, revision, updated_at,
      });
      return { success: true, meta: { changes: 1 } };
    }

    throw new Error('UNEXPECTED_SQL_RUN:' + sql);
  }

  async first() {
    if (this.sql.startsWith('SELECT owner,schema_version,snapshot_json,checksum_sha256,revision,updated_at FROM mel_connector_catalogs')) {
      const row = this.db.rows.get(this.args[0]);
      return row ? structuredClone(row) : null;
    }
    if (this.sql === 'SELECT checksum_sha256,revision FROM mel_connector_catalogs WHERE owner=?') {
      const row = this.db.rows.get(this.args[0]);
      return row ? {
        checksum_sha256: row.checksum_sha256,
        revision: row.revision,
      } : null;
    }
    if (this.sql === 'SELECT checksum_sha256 FROM mel_connector_catalogs WHERE owner=?') {
      const row = this.db.rows.get(this.args[0]);
      return row ? { checksum_sha256: row.checksum_sha256 } : null;
    }
    throw new Error('UNEXPECTED_SQL_FIRST:' + this.sql);
  }
}

class FakeD1 {
  constructor() {
    this.rows = new Map();
  }
  prepare(sql) {
    return new FakeStatement(this, sql);
  }
}

const githubManifest = {
  id: 'github',
  name: 'GitHub',
  version: '1.0.0',
  capabilities: ['repo.read', 'repo.write'],
  auth: 'oauth2',
  scopes: {
    required: ['repo:read'],
    optional: ['repo:write'],
  },
  metadata: { category: 'code' },
};

function healthyProbe() {
  return async () => ({
    status: 'healthy',
    code: 'READY',
    latency_ms: 7,
  });
}

test('D1 connector catalog survives restart with scopes, health and enabled state', async () => {
  let now = 1_000;
  const db = new FakeD1();
  const store = new D1ConnectorCatalogStore(db, { now: () => ++now });

  const first = await PersistentConnectorCatalog.restore({
    store,
    owner: 'adrien',
    healthProbe: healthyProbe(),
  });

  await first.register(githubManifest);
  await first.install({
    id: 'github',
    version: '1.0.0',
    grantedScopes: ['repo:read', 'repo:write'],
  });
  await first.checkHealth('github');
  await first.enable('github');

  assert.equal(first.get('github').state, 'enabled');
  assert.equal(first.state().revision, 4);

  const restarted = await PersistentConnectorCatalog.restore({
    store: new D1ConnectorCatalogStore(db, { now: () => ++now }),
    owner: 'adrien',
    healthProbe: healthyProbe(),
  });

  const restored = restarted.get('github');
  assert.equal(restored.state, 'enabled');
  assert.deepEqual(restored.granted_scopes, ['repo:read', 'repo:write']);
  assert.equal(restored.health.status, 'healthy');
  assert.equal(restarted.state().revision, 4);
});

test('D1 connector catalog is owner scoped with no cross-owner leakage', async () => {
  const db = new FakeD1();
  const store = new D1ConnectorCatalogStore(db);

  const adrien = await PersistentConnectorCatalog.restore({
    store,
    owner: 'adrien',
    healthProbe: healthyProbe(),
  });
  const other = await PersistentConnectorCatalog.restore({
    store,
    owner: 'other',
    healthProbe: healthyProbe(),
  });

  await adrien.register(githubManifest);
  await adrien.install({
    id: 'github',
    version: '1.0.0',
    grantedScopes: ['repo:read'],
  });

  assert.equal(adrien.listInstalled().length, 1);
  assert.equal(other.listInstalled().length, 0);
  assert.throws(() => other.get('github'), /CONNECTOR_CATALOG_NOT_INSTALLED/);
});

test('D1 connector catalog detects persisted snapshot tampering by checksum', async () => {
  const db = new FakeD1();
  const store = new D1ConnectorCatalogStore(db);
  const catalog = await PersistentConnectorCatalog.restore({
    store,
    owner: 'adrien',
  });

  await catalog.register(githubManifest);

  const row = db.rows.get('adrien');
  row.snapshot_json = row.snapshot_json.replace('GitHub', 'Tampered GitHub');

  await assert.rejects(
    () => new D1ConnectorCatalogStore(db).load('adrien'),
    { code: 'CONNECTOR_CATALOG_STORE_CHECKSUM_MISMATCH', status: 500 },
  );
});

test('optimistic concurrency refuses stale overwrite and resynchronizes stale runtime', async () => {
  const db = new FakeD1();
  const store = new D1ConnectorCatalogStore(db);

  const seed = await PersistentConnectorCatalog.restore({
    store,
    owner: 'adrien',
    healthProbe: healthyProbe(),
  });
  await seed.register(githubManifest);
  await seed.install({
    id: 'github',
    version: '1.0.0',
    grantedScopes: ['repo:read'],
  });
  await seed.checkHealth('github');
  await seed.enable('github');

  const first = await PersistentConnectorCatalog.restore({
    store,
    owner: 'adrien',
    healthProbe: healthyProbe(),
  });
  const stale = await PersistentConnectorCatalog.restore({
    store,
    owner: 'adrien',
    healthProbe: healthyProbe(),
  });

  const revisionBefore = first.state().revision;
  await first.disable('github');
  assert.equal(first.state().revision, revisionBefore + 1);

  await assert.rejects(
    () => stale.checkHealth('github'),
    { code: 'CONNECTOR_CATALOG_STORE_CONFLICT', status: 409 },
  );

  // Conflict path must refresh the stale instance to the latest durable state.
  assert.equal(stale.get('github').state, 'disabled');
  assert.equal(stale.state().revision, first.state().revision);
});

test('failed health result is persisted safely and cannot be enabled after restart', async () => {
  const db = new FakeD1();
  const store = new D1ConnectorCatalogStore(db);
  const catalog = await PersistentConnectorCatalog.restore({
    store,
    owner: 'adrien',
    healthProbe: async () => {
      throw new Error('sensitive upstream detail');
    },
  });

  await catalog.register(githubManifest);
  await catalog.install({
    id: 'github',
    version: '1.0.0',
    grantedScopes: ['repo:read'],
  });

  const health = await catalog.checkHealth('github');
  assert.deepEqual(health, {
    status: 'failed',
    code: 'PROBE_FAILED',
    latency_ms: null,
    checked_sequence: 2,
  });

  const restarted = await PersistentConnectorCatalog.restore({
    store: new D1ConnectorCatalogStore(db),
    owner: 'adrien',
    healthProbe: healthyProbe(),
  });

  assert.equal(restarted.get('github').health.status, 'failed');
  assert.equal(JSON.stringify(restarted.exportSnapshot()).includes('sensitive upstream'), false);
  await assert.rejects(
    () => restarted.enable('github'),
    /CONNECTOR_CATALOG_HEALTH_REQUIRED/,
  );
});

test('canonical secret-field rules apply before any snapshot is persisted', async () => {
  const db = new FakeD1();
  const catalog = await PersistentConnectorCatalog.restore({
    store: new D1ConnectorCatalogStore(db),
    owner: 'adrien',
  });

  await assert.rejects(
    () => catalog.register({
      ...githubManifest,
      metadata: {
        category: 'code',
        access_token: 'must-not-persist',
      },
    }),
    /CONNECTOR_CATALOG_SECRET_FIELD_FORBIDDEN/,
  );

  assert.equal(db.rows.size, 0);
});

test('refresh explicitly adopts durable state written by another runtime', async () => {
  const db = new FakeD1();
  const store = new D1ConnectorCatalogStore(db);
  const first = await PersistentConnectorCatalog.restore({
    store,
    owner: 'adrien',
    healthProbe: healthyProbe(),
  });
  const second = await PersistentConnectorCatalog.restore({
    store,
    owner: 'adrien',
    healthProbe: healthyProbe(),
  });

  await first.register(githubManifest);
  assert.equal(second.discover().length, 0);

  const state = await second.refresh();
  assert.equal(second.discover().length, 1);
  assert.equal(state.revision, 1);
  assert.equal(state.connector_count, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONNECTOR_CATALOG_SCHEMA,
  ConnectorCatalog
} from '../../src/connectors/connector-catalog.js';

const githubManifest = {
  id: 'github',
  name: 'GitHub',
  version: '1.0.0',
  capabilities: ['repo.write', 'repo.read', 'repo.read'],
  auth: 'oauth2',
  scopes: {
    required: ['repo:read'],
    optional: ['repo:write']
  },
  metadata: { category: 'code' }
};

const publicWebManifest = {
  id: 'public-web',
  name: 'Public web',
  version: '1.0.0',
  capabilities: ['web.search'],
  auth: 'none',
  scopes: { required: [], optional: [] },
  metadata: { category: 'research' }
};

test('catalog discovers deterministic provider-neutral manifests and rejects conflicting versions', () => {
  const catalog = new ConnectorCatalog();
  const first = catalog.register(githubManifest);
  catalog.register(publicWebManifest);

  assert.deepEqual(first.capabilities, ['repo.read', 'repo.write']);
  assert.deepEqual(catalog.register(githubManifest), first);
  assert.deepEqual(catalog.discover({ capability: 'repo.read' }).map(row => row.id), ['github']);
  assert.deepEqual(catalog.discover({ auth: 'none' }).map(row => row.id), ['public-web']);
  assert.deepEqual(catalog.discover().map(row => row.id), ['github', 'public-web']);

  assert.throws(() => catalog.register({
    ...githubManifest,
    name: 'Changed implementation'
  }), /CONNECTOR_CATALOG_VERSION_CONFLICT/);
});

test('manifest secret-bearing fields are rejected recursively', () => {
  const catalog = new ConnectorCatalog();
  assert.throws(() => catalog.register({
    ...githubManifest,
    metadata: {
      category: 'code',
      nested: { access_token: 'must-never-live-in-a-manifest' }
    }
  }), /CONNECTOR_CATALOG_SECRET_FIELD_FORBIDDEN/);
});

test('install enforces declared and required scopes and is idempotent for an exact replay', () => {
  const catalog = new ConnectorCatalog();
  catalog.register(githubManifest);

  assert.throws(() => catalog.install({
    id: 'github',
    version: '1.0.0',
    grantedScopes: []
  }), /CONNECTOR_CATALOG_REQUIRED_SCOPE_MISSING/);

  assert.throws(() => catalog.install({
    id: 'github',
    version: '1.0.0',
    grantedScopes: ['repo:read', 'admin:all']
  }), /CONNECTOR_CATALOG_SCOPE_UNDECLARED/);

  const installed = catalog.install({
    id: 'github',
    version: '1.0.0',
    grantedScopes: ['repo:write', 'repo:read', 'repo:write']
  });
  assert.equal(installed.state, 'installed');
  assert.deepEqual(installed.granted_scopes, ['repo:read', 'repo:write']);
  assert.deepEqual(catalog.install({
    id: 'github',
    version: '1.0.0',
    grantedScopes: ['repo:read', 'repo:write']
  }), installed);
});

test('connector cannot enable before a healthy probe and disable is idempotent', async () => {
  const catalog = new ConnectorCatalog({
    healthProbe: async manifest => ({
      status: manifest.id === 'github' ? 'healthy' : 'degraded',
      code: 'OK',
      latency_ms: 12.4
    })
  });
  catalog.register(githubManifest);
  catalog.install({ id: 'github', version: '1.0.0', grantedScopes: ['repo:read'] });

  assert.throws(() => catalog.enable('github'), /CONNECTOR_CATALOG_HEALTH_REQUIRED/);
  const health = await catalog.checkHealth('github');
  assert.deepEqual(health, {
    status: 'healthy',
    code: 'OK',
    latency_ms: 12,
    checked_sequence: 2
  });
  assert.equal(catalog.enable('github').state, 'enabled');
  assert.equal(catalog.disable('github').state, 'disabled');
  assert.equal(catalog.disable('github').state, 'disabled');
});

test('health probe failures expose only a safe failure code', async () => {
  const catalog = new ConnectorCatalog({
    healthProbe: async () => {
      throw new Error('sensitive upstream URL and credential detail');
    }
  });
  catalog.register(githubManifest);
  catalog.install({ id: 'github', version: '1.0.0', grantedScopes: ['repo:read'] });

  const health = await catalog.checkHealth('github');
  assert.equal(health.status, 'failed');
  assert.equal(health.code, 'PROBE_FAILED');
  assert.equal(JSON.stringify(health).includes('sensitive upstream'), false);
  assert.throws(() => catalog.enable('github'), /CONNECTOR_CATALOG_HEALTH_REQUIRED/);
});

test('portable snapshot preserves healthy enabled installs and rejects unsafe restored state', async () => {
  const source = new ConnectorCatalog({
    healthProbe: async () => ({ status: 'healthy', code: 'READY', latency_ms: 7 })
  });
  source.register(githubManifest);
  source.install({ id: 'github', version: '1.0.0', grantedScopes: ['repo:read'] });
  await source.checkHealth('github');
  source.enable('github');

  const snapshot = source.exportSnapshot();
  assert.equal(snapshot.schema, CONNECTOR_CATALOG_SCHEMA);

  const restored = new ConnectorCatalog({ snapshot });
  assert.equal(restored.get('github').state, 'enabled');
  assert.equal(restored.get('github').health.status, 'healthy');
  assert.deepEqual(restored.discover({ capability: 'repo.write' }).map(row => row.id), ['github']);

  const unsafe = structuredClone(snapshot);
  unsafe.installations[0].health.status = 'failed';
  assert.throws(() => new ConnectorCatalog({ snapshot: unsafe }), /CONNECTOR_CATALOG_SNAPSHOT_INVALID/);
});

test('invalid health result fails closed and missing probe is explicit', async () => {
  const withoutProbe = new ConnectorCatalog();
  withoutProbe.register(githubManifest);
  withoutProbe.install({ id: 'github', version: '1.0.0', grantedScopes: ['repo:read'] });
  await assert.rejects(() => withoutProbe.checkHealth('github'), /CONNECTOR_CATALOG_HEALTH_PROBE_REQUIRED/);

  const invalidProbe = new ConnectorCatalog({ healthProbe: async () => ({ status: 'mystery' }) });
  invalidProbe.register(githubManifest);
  invalidProbe.install({ id: 'github', version: '1.0.0', grantedScopes: ['repo:read'] });
  const health = await invalidProbe.checkHealth('github');
  assert.equal(health.status, 'failed');
  assert.equal(health.code, 'INVALID_PROBE_RESULT');
});

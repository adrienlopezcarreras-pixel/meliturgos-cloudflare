import test from 'node:test';
import assert from 'node:assert/strict';

import { SkillRegistry } from '../../src/evolution/skill-registry.js';
import {
  D1SkillRegistryStore,
  restoreD1SkillRegistry,
} from '../../src/evolution/d1-skill-registry-store.js';

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
    if (this.sql.startsWith('CREATE TABLE')) {
      return { success: true, meta: { changes: 0 } };
    }
    if (this.sql.startsWith('INSERT INTO mel_skill_registry_snapshots')) {
      const [registry_key, schema_version, snapshot_json, checksum_sha256, updated_at] = this.args;
      this.db.rows.set(registry_key, {
        registry_key,
        schema_version,
        snapshot_json,
        checksum_sha256,
        updated_at,
      });
      return { success: true, meta: { changes: 1 } };
    }
    throw new Error(`UNEXPECTED_SQL_RUN:${this.sql}`);
  }

  async first() {
    if (this.sql.includes('FROM mel_skill_registry_snapshots WHERE registry_key=?')) {
      const row = this.db.rows.get(this.args[0]);
      return row ? structuredClone(row) : null;
    }
    throw new Error(`UNEXPECTED_SQL_FIRST:${this.sql}`);
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

function verified(registry, version, capability = 'memory.search') {
  registry.register({
    skillId: 'skill.memory',
    name: 'Memory Search',
    version,
    capabilities: [capability],
    state: 'verified',
    evidence: [{ id: `proof-${version}`, status: 'pass' }],
    metadata: { source: 'test' },
  });
}

test('D1 Skill Registry survives runtime recreation with active version and rollback history', async () => {
  const db = new FakeD1();
  const store = new D1SkillRegistryStore(db);
  const registry = new SkillRegistry({ store });

  verified(registry, '1.0.0');
  verified(registry, '1.1.0');
  registry.activate('skill.memory', '1.0.0');
  registry.activate('skill.memory', '1.1.0');
  await registry.persist();

  const restored = await restoreD1SkillRegistry(db);
  assert.equal(restored.resolve('skill.memory').version, '1.1.0');
  assert.deepEqual(restored.history('skill.memory').map(row => row.version), ['1.0.0', '1.1.0']);

  const rollback = restored.rollback('skill.memory');
  assert.equal(rollback.active, '1.0.0');
  assert.equal(restored.resolve('skill.memory').version, '1.0.0');
});

test('D1 Skill Registry checksum detects tampering instead of importing corrupt state', async () => {
  const db = new FakeD1();
  const store = new D1SkillRegistryStore(db);
  const registry = new SkillRegistry({ store });

  verified(registry, '1.0.0');
  registry.activate('skill.memory', '1.0.0');
  await registry.persist();

  const row = db.rows.get('system');
  row.snapshot_json = row.snapshot_json.replace('Memory Search', 'Tampered Search');

  const restartedStore = new D1SkillRegistryStore(db);
  await assert.rejects(
    () => restartedStore.load(),
    /SKILL_REGISTRY_STORE_CHECKSUM_MISMATCH/,
  );
});

test('D1 Skill Registry keys isolate independent registries', async () => {
  const db = new FakeD1();

  const storeA = new D1SkillRegistryStore(db, { registryKey: 'owner-a' });
  const a = new SkillRegistry({ store: storeA });
  verified(a, '1.0.0', 'memory.search');
  a.activate('skill.memory', '1.0.0');
  await a.persist();

  const storeB = new D1SkillRegistryStore(db, { registryKey: 'owner-b' });
  const b = new SkillRegistry({ store: storeB });
  b.register({
    skillId: 'skill.code',
    name: 'Code Read',
    version: '2.0.0',
    capabilities: ['code.read'],
    state: 'verified',
    evidence: [{ id: 'proof-code', status: 'verified' }],
    metadata: {},
  });
  b.activate('skill.code', '2.0.0');
  await b.persist();

  const restoredA = await SkillRegistry.restore(new D1SkillRegistryStore(db, { registryKey: 'owner-a' }));
  const restoredB = await SkillRegistry.restore(new D1SkillRegistryStore(db, { registryKey: 'owner-b' }));

  assert.equal(restoredA.resolve('skill.memory').version, '1.0.0');
  assert.equal(restoredB.resolve('skill.code').version, '2.0.0');
  assert.throws(() => restoredA.resolve('skill.code'), /SKILL_REGISTRY_NO_ACTIVE_VERSION/);
});

test('D1 Skill Registry refuses schema drift and invalid snapshots', async () => {
  const db = new FakeD1();
  const store = new D1SkillRegistryStore(db);

  await assert.rejects(
    () => store.save({ schema: 'wrong', entries: [] }),
    /SKILL_REGISTRY_SNAPSHOT_INVALID/,
  );

  db.rows.set('system', {
    registry_key: 'system',
    schema_version: 'wrong-schema',
    snapshot_json: '{}',
    checksum_sha256: 'irrelevant',
    updated_at: Date.now(),
  });

  await assert.rejects(
    () => new D1SkillRegistryStore(db).load(),
    /SKILL_REGISTRY_STORE_SCHEMA_MISMATCH/,
  );
});

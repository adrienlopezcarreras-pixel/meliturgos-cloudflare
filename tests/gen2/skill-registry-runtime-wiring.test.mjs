import test from 'node:test';
import assert from 'node:assert/strict';

import { createGen2Runtime } from '../../src/core/orchestrator/gen2-runtime.js';
import { D1SkillRegistryStore } from '../../src/evolution/d1-skill-registry-store.js';

function compact(sql) { return String(sql).replace(/\s+/g, ' ').trim(); }
class Statement {
  constructor(db, sql) { this.db = db; this.sql = compact(sql); this.args = []; }
  bind(...args) { this.args = args; return this; }
  async run() {
    if (this.sql.startsWith('CREATE TABLE')) return { success: true };
    if (this.sql.startsWith('INSERT INTO mel_skill_registry_snapshots')) {
      const [registry_key, schema_version, snapshot_json, checksum_sha256, updated_at] = this.args;
      this.db.rows.set(registry_key, { registry_key, schema_version, snapshot_json, checksum_sha256, updated_at });
      return { success: true };
    }
    if (this.sql.startsWith('INSERT INTO audit_logs')) return { success: true };
    throw new Error(`UNEXPECTED_SQL_RUN:${this.sql}`);
  }
  async first() {
    if (this.sql.includes('FROM mel_skill_registry_snapshots WHERE registry_key=?')) {
      return structuredClone(this.db.rows.get(this.args[0]) || null);
    }
    return null;
  }
  async all() { return { results: [] }; }
}
class FakeD1 {
  constructor() { this.rows = new Map(); }
  prepare(sql) { return new Statement(this, sql); }
}

test('production composition root wires D1 Skill Registry and restores it across runtime recreation', async () => {
  const DB = new FakeD1();
  const firstRuntime = createGen2Runtime({ env: { DB, MEL_SKILL_REGISTRY_KEY: 'runtime-proof' } });
  assert.ok(firstRuntime.skillRegistry.store instanceof D1SkillRegistryStore);

  const first = await firstRuntime.skillRegistry.restore();
  first.register({
    skillId: 'skill.runtime-proof', name: 'Runtime Proof', version: '1.0.0',
    capabilities: ['runtime.proof'], state: 'verified',
    evidence: [{ id: 'runtime-proof-v1', status: 'pass' }], metadata: { source: 'composition-root' }
  });
  first.register({
    skillId: 'skill.runtime-proof', name: 'Runtime Proof', version: '1.1.0',
    capabilities: ['runtime.proof'], state: 'verified',
    evidence: [{ id: 'runtime-proof-v11', status: 'pass' }], metadata: { source: 'composition-root' }
  });
  first.activate('skill.runtime-proof', '1.0.0');
  first.activate('skill.runtime-proof', '1.1.0');
  await firstRuntime.skillRegistry.persist(first);

  const restartedRuntime = createGen2Runtime({ env: { DB, MEL_SKILL_REGISTRY_KEY: 'runtime-proof' } });
  const restored = await restartedRuntime.skillRegistry.restore();
  assert.equal(restored.resolve('skill.runtime-proof').version, '1.1.0');
  assert.equal(restored.rollback('skill.runtime-proof').active, '1.0.0');
  await restartedRuntime.skillRegistry.persist(restored);

  const secondRestart = createGen2Runtime({ env: { DB, MEL_SKILL_REGISTRY_KEY: 'runtime-proof' } });
  assert.equal((await secondRestart.skillRegistry.restore()).resolve('skill.runtime-proof').version, '1.0.0');
});

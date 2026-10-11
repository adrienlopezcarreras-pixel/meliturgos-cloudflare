import test from 'node:test';
import assert from 'node:assert/strict';

import { MemorySkillRegistryStore, SkillRegistry } from '../src/evolution/skill-registry.js';

function verifiedEvidence(id='proof') {
  return [{ id, status:'verified', source_sha:'a'.repeat(40) }];
}

test('active Skill Registry entries can only resolve to verified evidence-bearing immutable versions', async () => {
  const store = new MemorySkillRegistryStore();
  const registry = new SkillRegistry({ store });

  registry.register({
    skillId:'skill.audit',
    name:'Audit skill',
    version:'1.0.0-candidate',
    capabilities:['audit.run'],
    state:'candidate',
    evidence:[{ id:'candidate', status:'pass' }],
  });
  registry.register({
    skillId:'skill.audit',
    name:'Audit skill',
    version:'1.0.0',
    capabilities:['audit.run'],
    state:'verified',
    evidence:verifiedEvidence(),
  });
  registry.activate('skill.audit','1.0.0');
  await registry.persist();

  const restored = await SkillRegistry.restore(store);
  const active = restored.list({ activeOnly:true });
  assert.equal(active.length,1);
  assert.equal(active[0].state,'verified');
  assert.ok(active[0].evidence.some(row => row.status==='verified' || row.status==='pass'));

  for (const row of active) {
    assert.equal(restored.resolve(row.skill_id).version,row.version);
    assert.notEqual(row.state,'candidate');
    assert.notEqual(row.state,'deprecated');
  }
});

test('Skill Registry snapshot import fails closed if an active mapping points to unverified material', () => {
  const snapshot = {
    schema:'mel.skill-registry/v1',
    entries:[{
      skill_id:'skill.bad',
      name:'Bad active skill',
      version:'candidate',
      capabilities:['bad.run'],
      state:'candidate',
      evidence:[{ id:'candidate', status:'pass', sequence:1 }],
      metadata:{},
      sequence:1,
    }],
    active:{ 'skill.bad':'candidate' },
    activation_history:{ 'skill.bad':['candidate'] },
  };
  assert.throws(() => new SkillRegistry({ snapshot }), /SKILL_REGISTRY_SNAPSHOT_INVALID/);
});

test('verified state without passing or verified evidence cannot be activated', () => {
  const registry = new SkillRegistry();
  registry.register({
    skillId:'skill.no-proof',
    name:'No proof',
    version:'1.0.0',
    capabilities:['proof.run'],
    state:'verified',
    evidence:[{ id:'failed-proof', status:'failed' }],
  });
  assert.throws(
    () => registry.activate('skill.no-proof','1.0.0'),
    /SKILL_REGISTRY_VERSION_NOT_VERIFIED/,
  );
});

test('rollback cannot target a candidate or deprecated version', () => {
  const registry = new SkillRegistry();
  registry.register({
    skillId:'skill.rollback',
    name:'Rollback audit',
    version:'0.9.0-candidate',
    capabilities:['rollback.run'],
    state:'candidate',
    evidence:[{ id:'candidate', status:'pass' }],
  });
  registry.register({
    skillId:'skill.rollback',
    name:'Rollback audit',
    version:'1.0.0',
    capabilities:['rollback.run'],
    state:'verified',
    evidence:verifiedEvidence('proof-1'),
  });
  registry.activate('skill.rollback','1.0.0');

  assert.throws(
    () => registry.rollback('skill.rollback','0.9.0-candidate'),
    /SKILL_REGISTRY_VERSION_NOT_VERIFIED/,
  );
  assert.equal(registry.resolve('skill.rollback').version,'1.0.0');
});

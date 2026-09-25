import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultCapabilityBus } from '../../src/capabilities/default-bus.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';

const context = { owner:'owner', permissions:[], requestId:'skill-runtime-test' };

function candidatePipeline() {
  return {
    ok:true,
    status:'CANDIDATE',
    module_id:'fixture.module',
    candidate_ref:'candidate/fixture-module',
    activation_allowed:false,
    release_gate_required:true,
    stages:[
      'AI_STATE_OF_PLAY','INSPECTION','PLAN_GATE','SPEC','GENERATE',
      'VALIDATE','TEST','SANDBOX','SECURITY_REVIEW',
    ].map(stage => ({ stage, status:'PASS' })),
  };
}

const releaseEvidence = {
  approved:true,
  approval_id:'release-proof',
  tests_passed:true,
  sandbox_passed:true,
  security_passed:true,
  artifact_digest:'sha256:'+'a'.repeat(64),
  source_sha:'b'.repeat(40),
};

test('MEL-EVOL-05 exposes truthful Skill Registry health and contracts', () => {
  const noDb=createDefaultCapabilityBus({ env:{} });
  for(const id of [
    'skill.list','skill.resolve','skill.history','skill.snapshot.export',
    'skill.module.candidate.register','skill.module.release.verify',
    'skill.learning.sync','skill.rollback',
  ]){
    assert.equal(noDb.contract(id).valid,true,id);
    assert.equal(noDb.describe(id).health,'UNAVAILABLE',id);
  }

  const db=sqliteD1();
  try{
    const bus=createDefaultCapabilityBus({ env:{ DB:db, MELITURGOS_USER:'owner' } });
    for(const id of ['skill.list','skill.snapshot.export','skill.module.candidate.register']){
      assert.equal(bus.describe(id).health,'HEALTHY',id);
    }
  } finally {
    db.close();
  }
});

test('MEL-EVOL-05 persists candidate then verified active version across CapabilityBus recreation', async () => {
  const db=sqliteD1();
  try{
    const first=createDefaultCapabilityBus({ env:{ DB:db, MELITURGOS_USER:'owner' } });

    const candidate=await first.execute('skill.module.candidate.register',{
      skill_id:'skill.fixture',
      name:'Fixture skill',
      version:'1.0.0-candidate.1',
      capabilities:['fixture.run'],
      pipeline:candidatePipeline(),
      metadata:{ owner:'test' },
    },context);
    assert.equal(candidate.state,'candidate');

    const before=await first.execute('skill.list',{ active_only:true },context);
    assert.deepEqual(before,[]);

    const verified=await first.execute('skill.module.release.verify',{
      skill_id:'skill.fixture',
      candidate_version:'1.0.0-candidate.1',
      verified_version:'1.0.0',
      release_evidence:releaseEvidence,
      activate:true,
    },context);
    assert.equal(verified.record.state,'verified');
    assert.equal(verified.activation.active,'1.0.0');

    const second=createDefaultCapabilityBus({ env:{ DB:db, MELITURGOS_USER:'owner' } });
    const resolved=await second.execute('skill.resolve',{ skill_id:'skill.fixture' },context);
    assert.equal(resolved.version,'1.0.0');
    assert.equal(resolved.state,'verified');

    const history=await second.execute('skill.history',{ skill_id:'skill.fixture' },context);
    assert.deepEqual(history.map(row=>row.version),['1.0.0-candidate.1','1.0.0']);

    const active=await second.execute('skill.list',{ active_only:true },context);
    assert.deepEqual(active.map(row=>row.version),['1.0.0']);

    const snapshot=await second.execute('skill.snapshot.export',{},context);
    assert.equal(snapshot.schema,'mel.skill-registry/v1');
    assert.equal(snapshot.entries.length,2);
    assert.equal(snapshot.active['skill.fixture'],'1.0.0');
  } finally {
    db.close();
  }
});

test('MEL-EVOL-05 rejects release verification without complete independent evidence', async () => {
  const db=sqliteD1();
  try{
    const bus=createDefaultCapabilityBus({ env:{ DB:db, MELITURGOS_USER:'owner' } });
    await bus.execute('skill.module.candidate.register',{
      skill_id:'skill.fixture',
      name:'Fixture skill',
      version:'1.0.0-candidate.1',
      capabilities:['fixture.run'],
      pipeline:candidatePipeline(),
    },context);

    await assert.rejects(
      () => bus.execute('skill.module.release.verify',{
        skill_id:'skill.fixture',
        candidate_version:'1.0.0-candidate.1',
        verified_version:'1.0.0',
        release_evidence:{ ...releaseEvidence, security_passed:false },
      },context),
      /SKILL_BRIDGE_RELEASE_SECURITY_REQUIRED/,
    );

    assert.deepEqual(await bus.execute('skill.list',{ active_only:true },context),[]);
  } finally {
    db.close();
  }
});

test('MEL-EVOL-05 Skill Registry reads fail closed when D1 is unavailable', async () => {
  const bus=createDefaultCapabilityBus({ env:{} });
  for(const id of ['skill.list','skill.snapshot.export']){
    await assert.rejects(() => bus.execute(id,{},context), { code:'CAPABILITY_UNAVAILABLE' });
  }
});

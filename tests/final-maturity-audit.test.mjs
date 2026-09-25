import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { migrate } from '../src/persistence/migrations.js';
import { prepareGen2 } from '../src/persistence/gen2-schema.js';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { auditFinalMaturity } from '../src/diagnostics/final-maturity-audit.js';

async function dbFixture(){
  const db=sqliteD1();
  await migrate(db);
  await prepareGen2(db);
  return db;
}

test('GEN2-55 final maturity audit composes D1, capability contracts and roadmap structure', async()=>{
  const db=await dbFixture();
  try{
    const bus=createDefaultCapabilityBus({env:{DB:db,MELITURGOS_USER:'owner'}});
    const result=await auditFinalMaturity({bus,db});
    assert.equal(result.schema,'mel.final-maturity-audit');
    assert.equal(result.ok,true);
    assert.equal(result.checks.data_integrity,true);
    assert.equal(result.checks.capability_contracts,true);
    assert.equal(result.checks.roadmap_structure,true);
    assert.equal(result.invariants.read_only,true);
    assert.equal(result.invariants.capability_execution,false);
    assert.equal(result.invariants.network_calls,false);
  }finally{db.close();}
});

test('GEN2-55 final maturity audit fails when data integrity fails', async()=>{
  const db=await dbFixture();
  try{
    await db.prepare('DROP TABLE archive_messages').run();
    const bus=createDefaultCapabilityBus({env:{DB:db,MELITURGOS_USER:'owner'}});
    const result=await auditFinalMaturity({bus,db});
    assert.equal(result.ok,false);
    assert.equal(result.checks.data_integrity,false);
    assert.ok(result.summary.failed_domains.includes('data_integrity'));
  }finally{db.close();}
});

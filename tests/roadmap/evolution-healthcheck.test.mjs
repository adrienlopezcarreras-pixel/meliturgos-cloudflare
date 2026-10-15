import test from 'node:test';
import assert from 'node:assert/strict';
import {sqliteD1} from '../helpers/sqlite-d1.mjs';
import {CapabilityBus} from '../../src/capabilities/capability-bus.js';
import {registerEvolutionCapabilities} from '../../src/capabilities/evolution-capabilities.js';
import {initializeEvolutionStorage} from '../../src/roadmap/evolution-storage.js';
const ctx={owner:'owner',permissions:[]};
test('missing evolution D1 schema never appears healthy or produces an empty-success dashboard',async()=>{
 const db=sqliteD1();const bus=new CapabilityBus();registerEvolutionCapabilities(bus,{db});
 try{
  assert.equal(bus.describe('evolution.list').health,'UNTESTED');
  let probe=await bus.refreshHealth('evolution.list');
  assert.equal(probe.health,'UNAVAILABLE');
  assert.equal(probe.health_detail,'EVOLUTION_SCHEMA_V18_NOT_READY');
  await assert.rejects(bus.execute('evolution.list',{},ctx),/CAPABILITY_UNAVAILABLE/);
  await initializeEvolutionStorage(db);
  probe=await bus.refreshHealth('evolution.list');
  assert.equal(probe.health,'HEALTHY');
  const result=await bus.execute('evolution.list',{},ctx);
  assert.equal(result.evolution.total,0);
  assert.equal(result.initial_scope,'CURRENT_REGISTRY_NOT_ARCHIVED');
  await db.prepare('DROP TABLE mel_evolution_initial_archive').run();
  probe=await bus.refreshHealth('evolution.list');
  assert.equal(probe.health,'UNAVAILABLE');
  await assert.rejects(bus.execute('evolution.list',{},ctx),/CAPABILITY_UNAVAILABLE/);
 }finally{db.close();}
});
test('all writable evolution actions fail closed if D1 v18 is not migrated',async()=>{
 const db=sqliteD1();const bus=new CapabilityBus();registerEvolutionCapabilities(bus,{db});
 try{
  const p={owner:'owner',permissions:['roadmap.write']};
  const create=bus.execute('evolution.propose',{id:'E-1',title:'New memory feature',origin:'mel'},p);
  await assert.rejects(create,/CAPABILITY_UNAVAILABLE/);
  const gap=bus.execute('evolution.gap.capture',{goal:'Build cryogenic spectrometer'},p);
  await assert.rejects(gap,/CAPABILITY_UNAVAILABLE/);
  const review=bus.execute('evolution.review',{id:'E-1',expected_revision:1,next:'TRIAGED'},{
   ...p,permissions:['roadmap.approve'],approvedCapabilities:['evolution.review']
  });
  await assert.rejects(review,/CAPABILITY_UNAVAILABLE/);
 }finally{db.close();}
});

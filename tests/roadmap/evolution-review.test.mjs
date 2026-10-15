import test from 'node:test';
import assert from 'node:assert/strict';
import {CapabilityBus} from '../../src/capabilities/capability-bus.js';
import {registerEvolutionCapabilities} from '../../src/capabilities/evolution-capabilities.js';
import {initializeEvolutionStorage} from '../../src/roadmap/evolution-storage.js';
import {sqliteD1} from '../helpers/sqlite-d1.mjs';
import {runtimeCapabilityPermissions} from '../../src/security/runtime-permissions.js';

const candidate={id:'MEL-FIX-1',title:'Corriger le routage vocal',origin:'user'};
const owner='owner-one';
const perms=['roadmap.write','roadmap.approve'];
const approve={owner,permissions:perms,approvedCapabilities:['evolution.review']};
function init(){const db=sqliteD1();const bus=new CapabilityBus();registerEvolutionCapabilities(bus,{db});return {db,bus};}
test('MEL personal agent is never granted owner approval automatically',()=>{
 assert.equal(runtimeCapabilityPermissions({MEL_OWNER_PERSONAL_AGENT:'true'}).includes('roadmap.approve'),false);
 assert.equal(runtimeCapabilityPermissions({}).includes('roadmap.approve'),false);
});
test('review requires separate roadmap.approve AND explicit per-request approval',async()=>{
 const {db,bus}=init();
 try{
  await initializeEvolutionStorage(db);
  await bus.execute('evolution.propose',candidate,{owner,permissions:['roadmap.write']});
  const input={id:candidate.id,expected_revision:1,next:'TRIAGED'};
  await assert.rejects(bus.execute('evolution.review',input,{owner,permissions:['roadmap.write'],approvedCapabilities:['evolution.review']}),/PERMISSION_DENIED/);
  await assert.rejects(bus.execute('evolution.review',input,{owner,permissions:perms}),/EXPLICIT_APPROVAL_REQUIRED/);
  const reviewed=await bus.execute('evolution.review',input,approve);
  assert.equal(reviewed.item.status,'TRIAGED');assert.equal(reviewed.revision,2);
  assert.equal(reviewed.auto_deployed,false);
  const listing=await bus.execute('evolution.list',{}, {owner,permissions:[]});
  assert.equal(listing.items[0].revision,2);
  await assert.rejects(bus.execute('evolution.review',{...input,next:'APPROVED'},approve),/EVOLUTION_CONFLICT/);
  const approved=await bus.execute('evolution.review',{...input,expected_revision:2,next:'APPROVED'},approve);
  assert.equal(approved.item.status,'APPROVED');
  assert.equal(approved.revision,3);
  assert.equal(approved.item.evidence.length,0);
 } finally {db.close();}
});
test('review rejects direct approval, unauthorized tenant, unsupported DONE and stale revisions',async()=>{
 const {db,bus}=init();
 try{
  await initializeEvolutionStorage(db);
  await bus.execute('evolution.propose',candidate,{owner,permissions:['roadmap.write']});
  await assert.rejects(bus.execute('evolution.review',{id:candidate.id,expected_revision:1,next:'APPROVED'},approve),/EVOLUTION_INVALID_TRANSITION/);
  await assert.rejects(bus.execute('evolution.review',{id:candidate.id,expected_revision:1,next:'TRIAGED'},{...approve,owner:'other-owner'}),/EVOLUTION_ITEM_NOT_FOUND/);
  await assert.rejects(bus.execute('evolution.review',{id:candidate.id,expected_revision:1,next:'DONE_VERIFIED'},approve),/INVALID_INPUT|VALIDATION|enum/i);
  const row=await bus.execute('evolution.list',{}, {owner,permissions:[]});
  assert.equal(row.items[0].status,'PROPOSED');
 } finally {db.close();}
});

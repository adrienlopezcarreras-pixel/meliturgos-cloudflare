import test from 'node:test'; import assert from 'node:assert/strict';
import { createLocalServices } from '../../src/core/orchestrator/local-services.js';
import { audit } from '../../src/audit/audit-service.js';
test('local Gen2 adapters execute promised non-external contracts', async () => {
  const s=createLocalServices(); const e=await s.knowledgeGraph.entity({type:'PERSON',name:'Adrien',source:'test',confidence:1});
  assert.equal((await s.knowledgeGraph.query({type:'PERSON'})).length,1); const ev=await s.timeline.append({type:'NOTE',title:'x',description:'x',occurred_at:1,source:'test',confidence:1,metadata:{}}); assert.equal((await s.timeline.get({event_id:ev.event_id})).title,'x');
  const council=await s.modelCouncil.synthesize({responses:await s.modelCouncil.queryMultiple({models:['a'],input:'q'})}); assert.equal(council.provenance.mode,'mock-council');
  assert.equal((await s.teachers.evaluate({answer:'ok'})).score,1); assert.equal((await s.professor.score()).score,1);
  const a=await s.automations.create({type:'EVENT'}); await s.automations.enable({id:a.id}); assert.equal((await s.automations.run({id:a.id})).status,'SUCCEEDED');
  assert.equal((await s.selfHealing.test({})).passed,true); const b=await s.backup.create({x:1}); assert.equal((await s.backup.verify({id:b.id})).valid,true); assert.ok(e.id);
  let audited=false; await audit({prepare(){return {bind(){return {async run(){audited=true;}};}};}},'integration'); assert.equal(audited,true);
});

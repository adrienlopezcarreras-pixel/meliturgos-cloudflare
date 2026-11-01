import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultCapabilityBus} from '../src/capabilities/default-bus.js';
import {classifyRoadmapItem,ROADMAP_PROOF_SOURCES} from '../src/roadmap/roadmap-truth.js';
test('Teacher escalation preserves candidate provenance and requires best result',async()=>{
 const bus=createDefaultCapabilityBus({env:{}});
 assert.deepEqual(await bus.execute('council.teacher-escalation.verify',{}, {owner:'test',permissions:[]}),{ok:true,candidates:2});
});
test('MEL-COUNCIL-03 lacks live certification without observed handoff',()=>{
 assert.deepEqual(ROADMAP_PROOF_SOURCES['MEL-COUNCIL-03'],{capabilities:['council.teacher-escalation.verify']});
 assert.equal(classifyRoadmapItem('MEL-COUNCIL-03',{capabilities:new Map(),computer:new Map()}).truth,'UNPROVEN');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultCapabilityBus} from '../src/capabilities/default-bus.js';
import {classifyRoadmapItem,ROADMAP_PROOF_SOURCES} from '../src/roadmap/roadmap-truth.js';
test('MEL-COUNCIL-04 measured ranking honors owner choice',async()=>{
 const bus=createDefaultCapabilityBus({env:{}});
 assert.deepEqual(await bus.execute('models.task-learning.verify',{}, {owner:'test',permissions:[]}),{ok:true,samples:40});
});
test('MEL-COUNCIL-04 remains unproven without live production audit',()=>{
 assert.deepEqual(ROADMAP_PROOF_SOURCES['MEL-COUNCIL-04'],{capabilities:['models.task-learning.verify']});
 assert.equal(classifyRoadmapItem('MEL-COUNCIL-04',{capabilities:new Map(),computer:new Map()}).truth,'UNPROVEN');
});

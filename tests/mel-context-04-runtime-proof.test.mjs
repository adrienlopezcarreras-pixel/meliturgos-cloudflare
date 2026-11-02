import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultCapabilityBus} from '../src/capabilities/default-bus.js';
import {classifyRoadmapItem,ROADMAP_PROOF_SOURCES} from '../src/roadmap/roadmap-truth.js';
test('MEL-CONTEXT-04 interpreter on four request frames',async()=>{
 const bus=createDefaultCapabilityBus({env:{}});
 assert.deepEqual(await bus.execute('context.interpreter.verify',{}, {owner:'test',permissions:[]}),{ok:true,cases:4});
});
test('MEL-CONTEXT-04 cannot certify absent live audits',()=>{
 assert.deepEqual(ROADMAP_PROOF_SOURCES['MEL-CONTEXT-04'],{capabilities:['context.interpreter.verify']});
 assert.equal(classifyRoadmapItem('MEL-CONTEXT-04',{capabilities:new Map(),computer:new Map()}).truth,'UNPROVEN');
});

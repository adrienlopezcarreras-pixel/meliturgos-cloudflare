import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { classifyRoadmapItem, ROADMAP_PROOF_SOURCES } from '../src/roadmap/roadmap-truth.js';
test('GEN2-43 exercises the Model Watch discovery and threshold behavior',async()=>{
 const bus=createDefaultCapabilityBus({env:{}});
 assert.deepEqual(await bus.execute('evaluation.model-watch.verify',{}, {owner:'test',permissions:[]}),{ok:true,candidates:1});
});
test('GEN2-43 does not certify without production evidence',()=>{
 assert.deepEqual(ROADMAP_PROOF_SOURCES['GEN2-43'],{capabilities:['evaluation.model-watch.verify']});
 assert.equal(classifyRoadmapItem('GEN2-43',{capabilities:new Map(),computer:new Map()}).truth,'UNPROVEN');
});

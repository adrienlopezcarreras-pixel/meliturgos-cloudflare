import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultCapabilityBus} from '../src/capabilities/default-bus.js';
import {classifyRoadmapItem,ROADMAP_PROOF_SOURCES} from '../src/roadmap/roadmap-truth.js';
test('MEL-MEM-02 verifies idempotent replay and fail closed',async()=>{
 const bus=createDefaultCapabilityBus({env:{}});
 assert.deepEqual(await bus.execute('memory.exchange-sync.verify',{}, {owner:'test',permissions:[]}),{ok:true,candidates:1});
});
test('MEL-MEM-02 requires production audit for VERIFIED_LIVE',()=>{
 assert.deepEqual(ROADMAP_PROOF_SOURCES['MEL-MEM-02'],{capabilities:['memory.exchange-sync.verify']});
 assert.equal(classifyRoadmapItem('MEL-MEM-02',{capabilities:new Map(),computer:new Map()}).truth,'UNPROVEN');
});

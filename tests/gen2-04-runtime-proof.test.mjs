import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { classifyRoadmapItem, ROADMAP_PROOF_SOURCES } from '../src/roadmap/roadmap-truth.js';
test('GEN2-04 uses actual router failover',async()=>{
 const bus=createDefaultCapabilityBus({env:{}});
 assert.deepEqual(await bus.execute('models.router-fallback.verify',{}, {owner:'test',permissions:[]}),{ok:true,attempts:2});
});
test('GEN2-04 remains unproven absent production audit',()=>{
 assert.deepEqual(ROADMAP_PROOF_SOURCES['GEN2-04'],{capabilities:['models.router-fallback.verify']});
 assert.equal(classifyRoadmapItem('GEN2-04',{capabilities:new Map(),computer:new Map()}).truth,'UNPROVEN');
});

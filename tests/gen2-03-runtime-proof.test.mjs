import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { classifyRoadmapItem, ROADMAP_PROOF_SOURCES } from '../src/roadmap/roadmap-truth.js';
test('GEN2-03 executes provider-neutral model registry contract',async()=>{
 const bus=createDefaultCapabilityBus({env:{}});
 assert.deepEqual(await bus.execute('models.registry.verify',{}, {owner:'test',permissions:[]}),{ok:true,providers:2});
});
test('GEN2-03 mapping cannot certify absent live audit',()=>{
 assert.deepEqual(ROADMAP_PROOF_SOURCES['GEN2-03'],{capabilities:['models.registry.verify']});
 assert.equal(classifyRoadmapItem('GEN2-03',{capabilities:new Map(),computer:new Map()}).truth,'UNPROVEN');
});

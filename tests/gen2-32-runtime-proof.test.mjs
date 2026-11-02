import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultCapabilityBus} from '../src/capabilities/default-bus.js';
import {classifyRoadmapItem,ROADMAP_PROOF_SOURCES} from '../src/roadmap/roadmap-truth.js';
test('GEN2-32 SDK enforces health, scope and secret controls',async()=>{
 const bus=createDefaultCapabilityBus({env:{}});
 assert.deepEqual(await bus.execute('connectors.sdk-catalog.verify',{}, {owner:'test',permissions:[]}),{ok:true,checks:5});
});
test('GEN2-32 needs live production audit',()=>{
 assert.deepEqual(ROADMAP_PROOF_SOURCES['GEN2-32'],{capabilities:['connectors.sdk-catalog.verify']});
 assert.equal(classifyRoadmapItem('GEN2-32',{capabilities:new Map(),computer:new Map()}).truth,'UNPROVEN');
});

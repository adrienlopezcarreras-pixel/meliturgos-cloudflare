import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { classifyRoadmapItem, ROADMAP_PROOF_SOURCES } from '../src/roadmap/roadmap-truth.js';
test('MEL-EVAL-01 exercises benchmark scoring, regression and fail-closed rules',async()=>{
 const bus=createDefaultCapabilityBus({env:{}});
 assert.deepEqual(await bus.execute('evaluation.benchmark-contract.verify',{}, {owner:'test',permissions:[]}),{ok:true,domains:7});
});
test('MEL-EVAL-01 remains unverified without a recent production audit',()=>{
 assert.deepEqual(ROADMAP_PROOF_SOURCES['MEL-EVAL-01'],{capabilities:['evaluation.benchmark-contract.verify']});
 assert.equal(classifyRoadmapItem('MEL-EVAL-01',{capabilities:new Map(),computer:new Map()}).truth,'UNPROVEN');
});

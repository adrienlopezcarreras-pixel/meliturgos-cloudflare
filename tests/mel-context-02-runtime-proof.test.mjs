import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { classifyRoadmapItem, ROADMAP_PROOF_SOURCES } from '../src/roadmap/roadmap-truth.js';
test('long-context decisions survive omitted history',async()=>{
 const bus=createDefaultCapabilityBus({env:{}});
 const result=await bus.execute('context.long-decisions.verify',{}, {owner:'test',permissions:[]});
 assert.equal(result.ok,true);
 assert.ok(result.sourceChars>65000);
});
test('mapping is not a substitute for production proof',()=>{
 assert.deepEqual(ROADMAP_PROOF_SOURCES['MEL-CONTEXT-02'],{capabilities:['context.long-decisions.verify']});
 assert.equal(classifyRoadmapItem('MEL-CONTEXT-02',{capabilities:new Map(),computer:new Map()}).truth,'UNPROVEN');
});

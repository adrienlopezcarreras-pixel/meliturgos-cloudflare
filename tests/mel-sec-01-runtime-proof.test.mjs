import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { classifyRoadmapItem, ROADMAP_PROOF_SOURCES } from '../src/roadmap/roadmap-truth.js';
test('MEL-SEC-01 executes real context-builder prompt injection boundaries',async()=>{
 const bus=createDefaultCapabilityBus({env:{}});
 assert.deepEqual(await bus.execute('security.prompt-injection-firewall.verify',{}, {owner:'test',permissions:[]}),{ok:true,checked:8});
});
test('MEL-SEC-01 does not certify without real production execution',()=>{
 assert.deepEqual(ROADMAP_PROOF_SOURCES['MEL-SEC-01'],{capabilities:['security.prompt-injection-firewall.verify']});
 assert.equal(classifyRoadmapItem('MEL-SEC-01',{capabilities:new Map(),computer:new Map()}).truth,'UNPROVEN');
});

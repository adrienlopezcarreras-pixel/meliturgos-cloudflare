import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { MCP_MODERN_VERSION } from '../src/mcp/capability-adapter.js';
import { classifyRoadmapItem, ROADMAP_PROOF_SOURCES } from '../src/roadmap/roadmap-truth.js';
test('GEN2-50 verifies real MCP adapter and authorized tool invocation',async()=>{
 const bus=createDefaultCapabilityBus({env:{}});
 const result=await bus.execute('mcp.compatibility.verify',{}, {owner:'test',permissions:[]});
 assert.deepEqual(result,{ok:true,version:MCP_MODERN_VERSION});
});
test('GEN2-50 mapping does not certify without real production audit',()=>{
 assert.deepEqual(ROADMAP_PROOF_SOURCES['GEN2-50'],{capabilities:['mcp.compatibility.verify']});
 assert.equal(classifyRoadmapItem('GEN2-50',{capabilities:new Map(),computer:new Map()}).truth,'UNPROVEN');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCompanionD1DeviceLookup} from '../src/devices/companion-mcp-d1-lookup.js';
test('D1 must be configured',()=>assert.throws(()=>makeCompanionD1DeviceLookup(),/MCP_D1_REQUIRED/));
test('paired device without explicit grant is rejected',async()=>{
 const db={prepare:()=>({bind:()=>({first:async()=>null})})};
 assert.equal(await makeCompanionD1DeviceLookup(db)('owner','pc1'),null);
});
test('explicit owner grant is bound to subject and computer id',async()=>{
 let args;
 const db={prepare:sql=>({bind:(...v)=>{args=v;assert.match(sql,/companion_mcp_device_grants/);return {first:async()=>({owner_subject:'owner',device_id:'pc1',revoked:0,paired_id:'pc1'})};}})};
 const grant=await makeCompanionD1DeviceLookup(db)('owner','pc1');
 assert.deepEqual(args,['owner','pc1']);
 assert.deepEqual(grant,{owner_subject:'owner',device_id:'pc1',revoked:false,paired:true});
});
test('database errors propagate to fail-closed authorization',async()=>{
 const db={prepare:()=>{throw Error('missing grants table');}};
 await assert.rejects(makeCompanionD1DeviceLookup(db)('owner','pc1'),/missing grants table/);
});

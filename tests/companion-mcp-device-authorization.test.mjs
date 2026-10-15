import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompanionDeviceAuthorization} from '../src/devices/companion-mcp-device-authorization.js';
test('device lookup is mandatory',()=>{
 assert.throws(()=>createCompanionDeviceAuthorization(),/MCP_DEVICE_LOOKUP_REQUIRED/);
});
test('paired owner device accepted, cross-account rejected',async()=>{
 const authorize=createCompanionDeviceAuthorization({lookupOwnerDevice:async(subject,id)=>({owner_subject:'owner-a',device_id:id,paired:true})});
 assert.equal(await authorize({subject:'owner-a'},'win-1'),true);
 assert.equal(await authorize({subject:'owner-b'},'win-1'),false);
});
test('unpaired or revoked device denied',async()=>{
 for(const data of [{paired:false},{paired:true,revoked:true}]){
  const authorize=createCompanionDeviceAuthorization({lookupOwnerDevice:async(subject,id)=>({owner_subject:subject,device_id:id,...data})});
  assert.equal(await authorize({subject:'owner-a'},'win-1'),false);
 }
});
test('device lookup outage denies access',async()=>{
 const authorize=createCompanionDeviceAuthorization({lookupOwnerDevice:async()=>{throw Error('offline')}});
 assert.equal(await authorize({subject:'owner-a'},'win-1'),false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompanionMcpEndpoint} from '../src/devices/companion-mcp-endpoint.js';

test('cannot construct endpoint without device binding',()=>{
 assert.throws(()=>createCompanionMcpEndpoint({issuer:'https://issuer.example.test',jwks:{keys:[]},revoked:async()=>false,readStatus:async()=>({})}),/MCP_DEVICE_LOOKUP_REQUIRED/);
});
test('cannot construct endpoint without revocation lookup',()=>{
 assert.throws(()=>createCompanionMcpEndpoint({issuer:'https://issuer.example.test',jwks:{keys:[]},lookupOwnerDevice:async(subject,id)=>({owner_subject:subject,device_id:id,paired:true}),readStatus:async()=>({})}),/MCP_AUTH_CONFIG_INCOMPLETE/);
});
test('unsigned bearer is rejected by assembled endpoint',async()=>{
 const endpoint=createCompanionMcpEndpoint({
  issuer:'https://issuer.example.test',jwks:{keys:[]},revoked:async()=>false,
  lookupOwnerDevice:async(subject,id)=>({owner_subject:subject,device_id:id,paired:true}),readStatus:async()=>({id:'win-1',online:true})
 });
 const req=new Request('https://mel.example.test/mcp/companion/v1',{
  method:'POST',headers:{'content-type':'application/json',authorization:'Bearer unsigned.invalid.token'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})
 });
 const response=await endpoint(req);
 assert.equal(response.status,401);
});

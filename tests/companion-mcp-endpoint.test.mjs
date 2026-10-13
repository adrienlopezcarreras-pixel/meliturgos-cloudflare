import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompanionMcpEndpoint} from '../src/devices/companion-mcp-endpoint.js';

test('cannot construct endpoint without device binding',()=>{
 assert.throws(()=>createCompanionMcpEndpoint({allowedOrigin:'https://mel.example.test',issuer:'https://issuer.example.test',jwks:{keys:[]},revoked:async()=>false,readStatus:async()=>({})}),/MCP_STATUS_DB_REQUIRED/);
});
test('cannot construct endpoint without revocation lookup',()=>{
 assert.throws(()=>createCompanionMcpEndpoint({allowedOrigin:'https://mel.example.test',issuer:'https://issuer.example.test',jwks:{keys:[]},db:{prepare:()=>({bind:()=>({first:async()=>({owner_subject:'owner-1',device_id:'win-1',revoked:0,expires_at:Date.now()+60000,paired_id:'win-1'})})})},readStatus:async()=>({})}),/MCP_AUTH_CONFIG_INCOMPLETE/);
});
test('unsigned bearer is rejected by assembled endpoint',async()=>{
 const endpoint=createCompanionMcpEndpoint({
  allowedOrigin:'https://mel.example.test',issuer:'https://issuer.example.test',jwks:{keys:[]},revoked:async()=>false,
  db:{prepare:()=>({bind:()=>({first:async()=>({owner_subject:'owner-1',device_id:'win-1',revoked:0,expires_at:Date.now()+60000,paired_id:'win-1'})})})},readStatus:async()=>({id:'win-1',online:true})
 });
 const req=new Request('https://mel.example.test/mcp/companion/v1',{
  method:'POST',headers:{'content-type':'application/json',authorization:'Bearer unsigned.invalid.token'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})
 });
 const response=await endpoint(req);
 assert.equal(response.status,401);
});

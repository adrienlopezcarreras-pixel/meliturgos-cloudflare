import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCompanionMcpAuthenticator} from '../src/devices/companion-mcp-authenticator.js';
const config={issuer:'https://issuer.example.test',jwks:{keys:[]},revoked:async()=>false};
test('revocation callback mandatory, even with keyset',()=>{
 assert.throws(()=>makeCompanionMcpAuthenticator({issuer:config.issuer,jwks:config.jwks}),/MCP_AUTH_CONFIG_INCOMPLETE/);
});
test('authorization header must be strict bearer token',async()=>{
 const auth=makeCompanionMcpAuthenticator(config);
 for(const header of ['','Basic test','Bearer a b','Bearer secret\r\nInjected: x']){
  const req=new Request('https://example.test',{headers:{authorization:header.replace(/\r\n/g,'')}});
  await assert.rejects(auth(req),/MCP_BEARER_REQUIRED|JWT_/);
 }
});
test('unverifiable signatures must never authorize a session',async()=>{
 const auth=makeCompanionMcpAuthenticator(config);
 const req=new Request('https://example.test',{headers:{authorization:'Bearer abc.def.xyz'}});
 await assert.rejects(auth(req));
});

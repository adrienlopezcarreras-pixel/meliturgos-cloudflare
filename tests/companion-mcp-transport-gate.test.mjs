import test from 'node:test';
import assert from 'node:assert/strict';
import {checkCompanionMcpTransport} from '../src/devices/companion-mcp-transport-gate.js';
const origin='https://mcp-preview.example.test';
test('HTTPS origin exactly matched',()=>{
 assert.deepEqual(checkCompanionMcpTransport(new Request(origin+'/mcp/companion/v1'),{allowedOrigin:origin}),{ok:true});
});
test('HTTP and mismatched hosts refused',()=>{
 assert.equal(checkCompanionMcpTransport(new Request('http://mcp-preview.example.test/mcp/companion/v1'),{allowedOrigin:origin}).ok,false);
 assert.equal(checkCompanionMcpTransport(new Request('https://other.example.test/mcp/companion/v1'),{allowedOrigin:origin}).ok,false);
});
test('cross-origin requests refused',()=>{
 const r=new Request(origin+'/mcp/companion/v1',{headers:{origin:'https://attacker.example.test'}});
 assert.equal(checkCompanionMcpTransport(r,{allowedOrigin:origin}).code,'MCP_CROSS_ORIGIN_DENIED');
});
test('unconfigured preview host fails closed',()=>{
 assert.equal(checkCompanionMcpTransport(new Request(origin),{}).status,503);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {companionMcpProtectedResourceMetadata} from '../src/preview/companion-mcp-resource-metadata.js';
const env={MCP_PREVIEW_ORIGIN:'https://preview.example.test',MCP_OAUTH_ISSUER:'https://issuer.example.test'};
test('metadata publishes resource and authorization server without secrets',async()=>{
 const response=companionMcpProtectedResourceMetadata(new Request('https://preview.example.test/.well-known/oauth-protected-resource'),env);
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{resource:'https://preview.example.test/mcp/companion/v1',authorization_servers:['https://issuer.example.test'],scopes_supported:['companion:status:read'],bearer_methods_supported:['header']});
});
test('discovery fails closed on origin mismatch or invalid issuer',async()=>{
 for(const [url,settings] of [['https://other.example.test/.well-known/oauth-protected-resource',env],['https://preview.example.test/.well-known/oauth-protected-resource',{...env,MCP_OAUTH_ISSUER:'http://issuer.example.test'}]]){
  assert.equal(companionMcpProtectedResourceMetadata(new Request(url),settings).status,503);
 }
 assert.equal(companionMcpProtectedResourceMetadata(new Request('https://preview.example.test/.well-known/oauth-protected-resource',{method:'POST'}),env).status,405);
});

test('path-specific protected resource discovery is served',async()=>{
 const res=companionMcpProtectedResourceMetadata(new Request('https://preview.example.test/.well-known/oauth-protected-resource/mcp/companion/v1'),env);
 assert.equal(res.status,200);
 assert.equal((await res.json()).resource,'https://preview.example.test/mcp/companion/v1');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/preview/companion-mcp-worker.js';
test('preview worker without credentials cannot expose MCP',async()=>{
 const request=new Request('https://mcp.example.test/mcp/companion/v1',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
 const response=await worker.fetch(request,{});
 assert.equal(response.status,503);
 assert.equal((await response.json()).error,'MCP_PREVIEW_UNAVAILABLE');
});

test('OAuth discovery is available only after explicit preview opt-in',async()=>{
 const env={
  MCP_PREVIEW_ENABLED:'true',MCP_PREVIEW_ISOLATED:'true',MCP_PREVIEW_D1_ISOLATED:'true',MCP_PREVIEW_WORKER_NAME:'mcp-preview',MCP_PRODUCTION_WORKER_NAME:'mel-prod',MCP_PREVIEW_D1_DATABASE_ID:'d1-preview',MCP_PRODUCTION_D1_DATABASE_ID:'d1-prod',
  MCP_PREVIEW_ORIGIN:'https://mcp.example.test',
  MCP_OAUTH_ISSUER:'https://issuer.example.test',
  DB:{prepare:()=>({})}
 };
 const discovery=await worker.fetch(new Request('https://mcp.example.test/.well-known/oauth-protected-resource/mcp/companion/v1'),env);
 assert.equal(discovery.status,200);
 const metadata=await discovery.json();
 assert.equal(metadata.resource,'https://mcp.example.test/mcp/companion/v1');
 assert.deepEqual(metadata.authorization_servers,['https://issuer.example.test']);
 const disabled=await worker.fetch(new Request('https://mcp.example.test/.well-known/oauth-protected-resource/mcp/companion/v1'),{...env,MCP_PREVIEW_ENABLED:'false'});
 assert.equal(disabled.status,503);
});

test('preview refuses collision with production database before OAuth discovery',async()=>{
 const env={MCP_PREVIEW_ENABLED:'true',MCP_PREVIEW_ISOLATED:'true',MCP_PREVIEW_D1_ISOLATED:'true',MCP_PREVIEW_ORIGIN:'https://mcp.example.test',MCP_OAUTH_ISSUER:'https://issuer.example.test',MCP_PREVIEW_WORKER_NAME:'mcp-preview',MCP_PRODUCTION_WORKER_NAME:'mel-prod',MCP_PREVIEW_D1_DATABASE_ID:'d1-prod',MCP_PRODUCTION_D1_DATABASE_ID:'d1-prod',DB:{prepare:()=>({})}};
 const response=await worker.fetch(new Request('https://mcp.example.test/.well-known/oauth-protected-resource'),env);
 assert.equal(response.status,503);
});

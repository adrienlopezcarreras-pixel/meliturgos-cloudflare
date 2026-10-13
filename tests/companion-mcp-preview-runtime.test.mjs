import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewCompanionMcpHandler} from '../src/devices/companion-mcp-preview-runtime.js';
const config={MCP_OAUTH_ISSUER:'https://issuer.example.test',MCP_PREVIEW_ORIGIN:'https://mcp.example.test',MCP_OAUTH_JWKS:JSON.stringify({keys:[{kid:'x'}]})};
test('preview runtime refuses absent security bindings',()=>{
 assert.throws(()=>createPreviewCompanionMcpHandler({}),/MCP_PREVIEW_CONFIGURATION_INCOMPLETE/);
 assert.throws(()=>createPreviewCompanionMcpHandler({...config}),/MCP_PREVIEW_CONFIGURATION_INCOMPLETE/);
});
test('revocation database failure prevents bearer access',async()=>{
 const db={prepare:()=>{throw Error('DB_UNAVAILABLE');}};
 const handler=createPreviewCompanionMcpHandler({...config,DB:db});
 const r=await handler(new Request('https://mcp.example.test/mcp/companion/v1',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer invalid.token.value'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})}));
 assert.equal(r.status,401);
});
test('revocation schema stores hash only',async()=>{
 const {readFileSync}=await import('node:fs');
 const sql=readFileSync('migrations/20261013_companion_mcp_token_revocations.sql','utf8');
 assert.match(sql,/token_hash TEXT PRIMARY KEY/);
 assert.doesNotMatch(sql,/raw_token|bearer_token|password/i);
});

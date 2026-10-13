import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCompanionMcpPreviewEnv} from '../src/preview/companion-mcp-deployment-guard.js';
const db={prepare:()=>({})};
const valid={MCP_PREVIEW_ENABLED:'true',MCP_PREVIEW_ISOLATED:'true',MCP_PREVIEW_ORIGIN:'https://mcp-preview.example.test',MCP_OAUTH_ISSUER:'https://issuer.example.test',DB:db};
test('preview requires explicit enablement and isolation',()=>{
 assert.throws(()=>validateCompanionMcpPreviewEnv({...valid,MCP_PREVIEW_ENABLED:'false'}),/MCP_PREVIEW_DISABLED/);
 assert.throws(()=>validateCompanionMcpPreviewEnv({...valid,MCP_PREVIEW_ISOLATED:'false'}),/MCP_PREVIEW_NOT_ISOLATED/);
 assert.equal(validateCompanionMcpPreviewEnv(valid),true);
});
test('preview cannot use insecure HTTP issuer or origin',()=>{
 assert.throws(()=>validateCompanionMcpPreviewEnv({...valid,MCP_OAUTH_ISSUER:'http://issuer.example.test'}),/MCP_PREVIEW_HTTPS_REQUIRED/);
 assert.throws(()=>validateCompanionMcpPreviewEnv({...valid,MCP_PREVIEW_ORIGIN:'http://preview.example.test'}),/MCP_PREVIEW_HTTPS_REQUIRED/);
});

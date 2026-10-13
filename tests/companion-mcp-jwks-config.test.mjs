import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewCompanionMcpHandler} from '../src/devices/companion-mcp-preview-runtime.js';
test('invalid or missing JWKS blocks preview MCP initialization',()=>{
 const base={MCP_OAUTH_ISSUER:'https://issuer.example.test',MCP_PREVIEW_ORIGIN:'https://preview.example.test',DB:{prepare:()=>({})}};
 assert.throws(()=>createPreviewCompanionMcpHandler({...base,MCP_OAUTH_JWKS:'not-json'}),/MCP_JWKS_CONFIGURATION_INVALID/);
 assert.throws(()=>createPreviewCompanionMcpHandler({...base,MCP_OAUTH_JWKS:'{"keys":[]}'}),/MCP_PREVIEW_CONFIGURATION_INCOMPLETE/);
});

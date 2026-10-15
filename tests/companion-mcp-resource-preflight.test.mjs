import test from 'node:test';
import assert from 'node:assert/strict';
import {companionMcpPreviewPreflight} from '../src/preview/companion-mcp-resource-preflight.js';
const base={MCP_PREVIEW_ENABLED:'true',MCP_PREVIEW_ISOLATED:'true',MCP_PREVIEW_D1_ISOLATED:'true',MCP_PREVIEW_ORIGIN:'https://preview.example.test',MCP_OAUTH_ISSUER:'https://issuer.example.test',DB:{prepare:()=>({})},MCP_PREVIEW_WORKER_NAME:'mel-preview',MCP_PRODUCTION_WORKER_NAME:'mel-prod',MCP_PREVIEW_D1_DATABASE_ID:'db-preview',MCP_PRODUCTION_D1_DATABASE_ID:'db-prod'};
test('operator preflight checks distinct Worker and D1 resources',()=>{
 assert.equal(companionMcpPreviewPreflight(base).ready_for_manual_review,true);
 assert.throws(()=>companionMcpPreviewPreflight({...base,MCP_PREVIEW_D1_DATABASE_ID:'db-prod'}),/MCP_PREVIEW_RESOURCE_COLLISION/);
 assert.throws(()=>companionMcpPreviewPreflight({...base,MCP_PREVIEW_WORKER_NAME:'mel-prod'}),/MCP_PREVIEW_RESOURCE_COLLISION/);
 assert.throws(()=>companionMcpPreviewPreflight({...base,MCP_PRODUCTION_D1_DATABASE_ID:''}),/MCP_RESOURCE_IDENTITIES_REQUIRED/);
});

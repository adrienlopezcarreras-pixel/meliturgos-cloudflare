import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/preview/companion-mcp-worker.js';
test('preview worker without credentials cannot expose MCP',async()=>{
 const request=new Request('https://mcp.example.test/mcp/companion/v1',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
 const response=await worker.fetch(request,{});
 assert.equal(response.status,503);
 assert.equal((await response.json()).error,'MCP_PREVIEW_UNAVAILABLE');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {companionMcpHttp,MCP_HTTP_PATH} from '../src/devices/companion-mcp-http.js';

test('remote MCP route denies requests until OAuth is implemented',()=>{
 const u='https://mel.example.test'+MCP_HTTP_PATH;
 for(const method of ['GET','POST','DELETE']){
  const req=new Request(u,{method,headers:{authorization:'Bearer attacker-controlled'}});
  const result=companionMcpHttp(req);
  assert.equal(result.status,503);
 }
});
test('even callback supplied cannot activate remote interface',()=>{
 const req=new Request('https://mel.example.test'+MCP_HTTP_PATH,{method:'POST'});
 assert.equal(companionMcpHttp(req,{authorize:()=>true}).status,503);
});
test('other paths are not MCP',()=>{
 const req=new Request('https://mel.example.test/other');
 assert.equal(companionMcpHttp(req).status,404);
});

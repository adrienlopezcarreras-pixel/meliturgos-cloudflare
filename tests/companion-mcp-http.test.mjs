import test from 'node:test';
import assert from 'node:assert/strict';
import {companionMcpHttp,MCP_HTTP_PATH} from '../src/devices/companion-mcp-http.js';
const endpoint='https://mel.example.test'+MCP_HTTP_PATH;
function request(method,body,headers={}){return new Request(endpoint,{method,headers:{'content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});}
const services={
 authenticate:async()=>({subject:'owner-1',audience:'mel-companion-mcp',scope:'companion:status:read'}),
 authorizeDevice:async(user,id)=>user.subject==='owner-1'&&id==='win-1',
 readStatus:async(user,id)=>({id,online:true,halted:false,last_seen_at:1720000000000,secret:'HIDDEN'})
};
test('no OAuth services means fail-closed',async()=>{
 const res=await companionMcpHttp(request('POST',{jsonrpc:'2.0',id:1,method:'tools/list'}));
 assert.equal(res.status,503);
});
test('unauthorized identity blocked',async()=>{
 const res=await companionMcpHttp(request('POST',{jsonrpc:'2.0',id:2,method:'tools/list'}),{...services,authenticate:async()=>null});
 assert.equal(res.status,401);
});
test('device ACL blocks cross-user access',async()=>{
 const res=await companionMcpHttp(request('POST',{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'mel_companion_status',arguments:{computer_id:'someone-elses-pc'}}}),services);
 assert.equal(res.status,403);
});
test('authorized device returns sanitized status only',async()=>{
 const res=await companionMcpHttp(request('POST',{jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'mel_companion_status',arguments:{computer_id:'win-1'}}}),services);
 assert.equal(res.status,200);
 const j=await res.json();
 const value=JSON.parse(j.result.content[0].text);
 assert.deepEqual(value,{id:'win-1',online:true,halted:false,last_seen_at:1720000000000});
 assert.equal(JSON.stringify(j).includes('HIDDEN'),false);
});
test('method discovery exposes only status, no arbitrary OS execution',async()=>{
 const res=await companionMcpHttp(request('POST',{jsonrpc:'2.0',id:5,method:'tools/list'}),services);
 assert.deepEqual((await res.json()).result.tools.map(t=>t.name),['mel_companion_status']);
});
test('missing device id rejected',async()=>{
 const res=await companionMcpHttp(request('POST',{jsonrpc:'2.0',id:6,method:'tools/call',params:{name:'mel_companion_status',arguments:{}}}),services);
 assert.equal((await res.json()).error.code,-32602);
});
test('other paths do not route',async()=>{
 const res=await companionMcpHttp(new Request('https://mel.example.test/other'),services);
 assert.equal(res.status,404);
});
test('HTTP GET refuses tool access even when authenticated',async()=>{
 const res=await companionMcpHttp(request('GET'),services);
 assert.equal(res.status,405);
});

test('unsupported MCP protocol version is rejected',async()=>{
 const res=await companionMcpHttp(request('POST',{jsonrpc:'2.0',id:7,method:'tools/list'},{'mcp-protocol-version':'2099-01-01'}),services);
 assert.equal(res.status,400);
});
test('non-json media type is rejected',async()=>{
 const res=await companionMcpHttp(request('POST',{jsonrpc:'2.0',id:8,method:'tools/list'},{'content-type':'text/plain'}),services);
 assert.equal(res.status,415);
});
test('oversize content length denied',async()=>{
 const res=await companionMcpHttp(request('POST',{jsonrpc:'2.0',id:9,method:'tools/list'},{'content-length':'20000'}),services);
 assert.equal(res.status,413);
});

test('OAuth principal with wrong audience is denied',async()=>{
 const res=await companionMcpHttp(request('POST',{jsonrpc:'2.0',id:10,method:'tools/list'}),{
  ...services,authenticate:async()=>({subject:'owner-1',audience:'another-service',scope:'companion:status:read'})
 });
 assert.equal(res.status,403);
});
test('OAuth principal missing read scope is denied',async()=>{
 const res=await companionMcpHttp(request('POST',{jsonrpc:'2.0',id:11,method:'tools/list'}),{
  ...services,authenticate:async()=>({subject:'owner-1',audience:'mel-companion-mcp',scope:'other:read'})
 });
 assert.equal(res.status,403);
});

test('explicit Streamable HTTP Accept supports both media types',async()=>{
 const good=await companionMcpHttp(request('POST',{jsonrpc:'2.0',id:12,method:'tools/list'},{accept:'application/json, text/event-stream'}),services);
 assert.equal(good.status,200);
 const bad=await companionMcpHttp(request('POST',{jsonrpc:'2.0',id:13,method:'tools/list'},{accept:'text/html'}),services);
 assert.equal(bad.status,406);
});

test('initialized notification receives 202 but unknown notifications are denied',async()=>{
 const initialized=await companionMcpHttp(request('POST',{jsonrpc:'2.0',method:'notifications/initialized'}),services);
 assert.equal(initialized.status,202);
 const other=await companionMcpHttp(request('POST',{jsonrpc:'2.0',method:'tools/call',params:{name:'mel_companion_status',arguments:{computer_id:'win-1'}}}),services);
 assert.equal(other.status,400);
});

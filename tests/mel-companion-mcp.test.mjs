import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

async function request(messages,env={}){
 const child=spawn(process.execPath,['tools/mel-companion-mcp.mjs'],{cwd:process.cwd(),env:{...process.env,...env},stdio:['pipe','pipe','pipe']});
 let buffer='';
 const results=[];
 child.stdout.setEncoding('utf8');
 child.stdout.on('data',x=>{buffer+=x;const rows=buffer.split('\n');buffer=rows.pop();for(const s of rows)if(s.trim())results.push(JSON.parse(s));});
 for(const msg of messages)child.stdin.write(JSON.stringify(msg)+'\n');
 child.stdin.end();
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
 assert.equal(code,0);
 return results;
}

test('stdio server advertises only read-only status tool',async()=>{
 const results=await request([
  {jsonrpc:'2.0',id:1,method:'initialize',params:{}},
  {jsonrpc:'2.0',id:2,method:'tools/list'}
 ]);
 assert.equal(results[0].result.serverInfo.name,'mel-companion-readonly');
 assert.deepEqual(results[1].result.tools.map(t=>t.name),['mel_companion_status']);
});

test('missing token returns error and does not claim connected',async()=>{
 const results=await request([{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'mel_companion_status',arguments:{}}}],{MEL_MCP_SERVER_URL:'https://example.com/',MEL_MCP_OWNER_TOKEN:''});
 assert.equal(results[0].result.isError,true);
 assert.match(results[0].result.content[0].text,/MEL_MCP_OWNER_TOKEN_NOT_SET/);
});

test('arbitrary command and unknown arguments rejected',async()=>{
 const results=await request([
  {jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'system.exec',arguments:{command:'whoami'}}},
  {jsonrpc:'2.0',id:5,method:'tools/call',params:{name:'mel_companion_status',arguments:{command:'whoami'}}}
 ]);
 assert.equal(results[0].error.code,-32602);
 assert.equal(results[1].error.code,-32602);
});

test('oversized JSON-RPC line is rejected before parsing',async()=>{
 const huge='x'.repeat(17000);
 const results=await request([{jsonrpc:'2.0',id:6,method:'tools/call',params:{name:'mel_companion_status',arguments:{computer_id:huge}}}]);
 assert.equal(results[0].error.code,-32600);
});

test('HTTP endpoint is rejected without attempting to connect',async()=>{
 const results=await request([{jsonrpc:'2.0',id:7,method:'tools/call',params:{name:'mel_companion_status',arguments:{}}}],{
  MEL_MCP_SERVER_URL:'http://127.0.0.1:8787/',MEL_MCP_OWNER_TOKEN:'test-only'
 });
 assert.equal(results[0].result.isError,true);
 assert.match(results[0].result.content[0].text,/MEL_MCP_SERVER_URL_MUST_BE_HTTPS_ORIGIN/);
});

test('MCP initialize, ping and unsupported method are explicit',async()=>{
 const results=await request([
  {jsonrpc:'2.0',id:8,method:'ping'},
  {jsonrpc:'2.0',id:9,method:'not-a-tool'}
 ]);
 assert.deepEqual(results[0].result,{});
 assert.equal(results[1].error.code,-32601);
});

test('invalid owner token with newline is rejected before network access',async()=>{
 const results=await request([{jsonrpc:'2.0',id:10,method:'tools/call',params:{name:'mel_companion_status',arguments:{}}}],{
  MEL_MCP_SERVER_URL:'https://example.com/',MEL_MCP_OWNER_TOKEN:'bad\nheader'
 });
 assert.equal(results[0].result.isError,true);
 assert.match(results[0].result.content[0].text,/MEL_MCP_OWNER_TOKEN_INVALID/);
});

test('owner authenticated status response hides internal details',async()=>{
 const results=await request([{jsonrpc:'2.0',id:11,method:'tools/call',params:{name:'mel_companion_status',arguments:{computer_id:'win-1'}}}],{
  MEL_MCP_SERVER_URL:'https://mel.example.test/',
  MEL_MCP_OWNER_TOKEN:'local-fixture-secret',
  NODE_OPTIONS:'--import=./tests/fixtures/mel-mcp-fetch-mock.mjs'
 });
 assert.equal(results[0].result.isError,undefined);
 const output=results[0].result.content[0].text;
 const data=JSON.parse(output);
 assert.equal(data.devices[0].online,true);
 assert.equal(data.commands[0].status,'SUCCEEDED');
 assert.equal(output.includes('DO_NOT_EXPOSE'),false);
 assert.equal(output.includes('SECRET_HOST'),false);
});

test('rejects HTML masquerading as successful status',async()=>{
 const results=await request([{jsonrpc:'2.0',id:12,method:'tools/call',params:{name:'mel_companion_status',arguments:{}}}],{
  MEL_MCP_SERVER_URL:'https://mel.example.test/',MEL_MCP_OWNER_TOKEN:'fixture-token',NODE_OPTIONS:'--import=./tests/fixtures/mel-mcp-invalid-content-mock.mjs'
 });
 assert.equal(results[0].result.isError,true);
 assert.match(results[0].result.content[0].text,/MEL_STATUS_NOT_JSON/);
});

test('read-only MCP never advertises a command execution tool',async()=>{
 const results=await request([{jsonrpc:'2.0',id:13,method:'tools/list'}]);
 const names=results[0].result.tools.map(t=>t.name);
 assert.deepEqual(names,['mel_companion_status']);
 for(const forbidden of ['system.exec','mel_companion_run','mel_companion_flash','mel_companion_install']){
  assert.equal(names.includes(forbidden),false);
 }
});


test('computer_id rejects control characters before network access',async()=>{
 const results=await request([{jsonrpc:'2.0',id:14,method:'tools/call',params:{name:'mel_companion_status',arguments:{computer_id:'win-1\nforged'}}}],{MEL_MCP_SERVER_URL:'https://example.com/',MEL_MCP_OWNER_TOKEN:'test-token'});
 assert.equal(results[0].error.code,-32602);
});


test('null tool arguments fail validation without attempting status fetch',async()=>{
 const results=await request([{jsonrpc:'2.0',id:15,method:'tools/call',params:{name:'mel_companion_status',arguments:null}}]);
 assert.equal(results[0].error.code,-32602);
});


test('tool call without request ID is rejected rather than executed',async()=>{
 const results=await request([{jsonrpc:'2.0',method:'tools/call',params:{name:'mel_companion_status',arguments:{}}}]);
 assert.equal(results[0].error.code,-32600);
});


test('invalid structured request id is rejected before tool access',async()=>{
 const results=await request([{jsonrpc:'2.0',id:{nested:1},method:'tools/call',params:{name:'mel_companion_status',arguments:{}}}]);
 assert.equal(results[0].error.code,-32600);
 assert.equal(results[0].id,null);
});

test('authenticated MCP handshake and status call work in one session without leaking secret fields',async()=>{
 const responses=await request([
  {jsonrpc:'2.0',id:21,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'offline-client',version:'1.0'}}},
  {jsonrpc:'2.0',method:'notifications/initialized'},
  {jsonrpc:'2.0',id:22,method:'tools/list'},
  {jsonrpc:'2.0',id:23,method:'tools/call',params:{name:'mel_companion_status',arguments:{computer_id:'win-1'}}}
 ],{
  MEL_MCP_SERVER_URL:'https://mel.example.test/',
  MEL_MCP_OWNER_TOKEN:'local-fixture-secret',
  NODE_OPTIONS:'--import=./tests/fixtures/mel-mcp-fetch-mock.mjs'
 });
 assert.deepEqual(responses.map(r=>r.id),[21,22,23]);
 assert.equal(responses[0].result.protocolVersion,'2025-03-26');
 assert.deepEqual(responses[1].result.tools.map(t=>t.name),['mel_companion_status']);
 assert.equal(responses[2].result.isError,undefined);
 const data=JSON.parse(responses[2].result.content[0].text);
 assert.equal(data.selected_id,'win-1');
 assert.equal(data.devices[0].online,true);
 assert.equal(data.devices[0].remote_access_enabled,true);
 assert.equal(data.commands[0].status,'SUCCEEDED');
 const output=JSON.stringify(responses);
 for(const secret of ['DO_NOT_EXPOSE','SECRET_HOST','local-fixture-secret'])assert.equal(output.includes(secret),false);
});


test('401 owner authorization failure cannot be reported as connected Companion status',async()=>{
 const responses=await request([{jsonrpc:'2.0',id:24,method:'tools/call',params:{name:'mel_companion_status',arguments:{}}}],{
  MEL_MCP_SERVER_URL:'https://mel.example.test/',MEL_MCP_OWNER_TOKEN:'rejected-fixture-token',
  NODE_OPTIONS:'--import=./tests/fixtures/mel-mcp-unauthorized-mock.mjs'
 });
 assert.equal(responses[0].result.isError,true);
 assert.equal(responses[0].result.content[0].text,'MEL_STATUS_HTTP_401');
 assert.equal(JSON.stringify(responses).includes('fake'),false);
});


test('network disconnect fails closed and never returns stale online status',async()=>{
 const responses=await request([{jsonrpc:'2.0',id:25,method:'tools/call',params:{name:'mel_companion_status',arguments:{}}}],{
  MEL_MCP_SERVER_URL:'https://mel.example.test/',MEL_MCP_OWNER_TOKEN:'fixture-token',
  NODE_OPTIONS:'--import=./tests/fixtures/mel-mcp-network-down-mock.mjs'
 });
 assert.equal(responses[0].result.isError,true);
 assert.equal(responses[0].result.content[0].text,'MEL_STATUS_UNAVAILABLE');
 assert.equal(JSON.stringify(responses).includes('SECRET_NETWORK_DETAIL'),false);
});


test('oversized multibyte UTF-8 status response is rejected',async()=>{
 const responses=await request([{jsonrpc:'2.0',id:26,method:'tools/call',params:{name:'mel_companion_status',arguments:{}}}],{
  MEL_MCP_SERVER_URL:'https://mel.example.test/',MEL_MCP_OWNER_TOKEN:'fixture-token',
  NODE_OPTIONS:'--import=./tests/fixtures/mel-mcp-oversized-utf8-mock.mjs'
 });
 assert.equal(responses[0].result.isError,true);
 assert.equal(responses[0].result.content[0].text,'MEL_STATUS_TOO_LARGE');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {companionMcpHttp} from '../src/devices/companion-mcp-http.js';
const endpoint='https://mcp-preview.example.test/mcp/companion/v1';
const services={authenticate:async()=>({subject:'owner',audience:'mel-companion-mcp',scope:'companion:status:read'}),authorizeDevice:async()=>true,readStatus:async(_,id)=>({id,online:true,halted:false,last_seen_at:Date.now()})};
function post(method,params,id){return companionMcpHttp(new Request(endpoint,{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-03-26'},body:JSON.stringify({jsonrpc:'2.0',...id===undefined?{}:{id},method,...params?{params}:{}})}),services);}
test('Streamable HTTP client handshake then status call',async()=>{
 const init=await post('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test-client',version:'1'}},1);
 assert.equal(init.status,200);
 assert.equal((await init.json()).result.protocolVersion,'2025-03-26');
 assert.equal((await post('notifications/initialized',undefined,undefined)).status,202);
 const list=await post('tools/list',{},2);
 assert.deepEqual((await list.json()).result.tools.map(t=>t.name),['mel_companion_status']);
 const call=await post('tools/call',{name:'mel_companion_status',arguments:{computer_id:'win-1'}},3);
 assert.equal(call.status,200);
 assert.equal(JSON.parse((await call.json()).result.content[0].text).online,true);
});

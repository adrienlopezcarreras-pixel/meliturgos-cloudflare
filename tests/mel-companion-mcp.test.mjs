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

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createGitHubCodeReader,registerGitHubCodeCapabilities} from '../src/capabilities/github-code-capabilities.js';
import {CapabilityBus} from '../src/capabilities/capability-bus.js';
const PIN='c'.repeat(40),BLOB='b'.repeat(40);
const source=await readFile(new URL('../src/pages/full-interface-v2.js',import.meta.url),'utf8');
const lines=source.split(/\r?\n/),start=Math.floor(lines.length/2),end=start+3;
function fixture(mode='api',content=source){
 const calls=[];
 const fetchImpl=async url=>{
  calls.push(String(url));
  if(String(url).includes('api.github.com')){
   assert.equal(new URL(url).searchParams.get('ref'),PIN);
   if(mode==='raw')return new Response('',{status:403});
   return Response.json({type:'file',sha:BLOB,size:Buffer.byteLength(content),content:Buffer.from(content).toString('base64')});
  }
  assert.ok(String(url).includes('/'+PIN+'/'));
  return new Response(content,{headers:{etag:'raw-fixture'}});
 };
 return {reader:createGitHubCodeReader({repository:'o/r',branch:'release/fixture',pinnedSha:PIN,fetchImpl}),calls,fetchImpl};
}
for(const mode of ['api','raw'])test('a real oversized MEL UI source supports a bounded pinned line read: '+mode,async()=>{
 const f=fixture(mode);
 assert.ok(Buffer.byteLength(source)>180000);
 await assert.rejects(f.reader.read('src/pages/full-interface-v2.js'),error=>error.code==='CODE_FILE_TOO_LARGE');
 const row=await f.reader.read('src/pages/full-interface-v2.js',{start_line:start,end_line:end});
 assert.equal(row.content,lines.slice(start-1,end).join('\n'));assert.equal(row.start_line,start);assert.equal(row.end_line,end);assert.equal(row.total_lines,lines.length);assert.equal(row.partial,true);assert.equal(row.source_ref,PIN);assert.equal(row.repository,'o/r');
});

test('small default reads keep the existing complete-file result contract',async()=>{
 const f=fixture('api','first\nsecond');
 assert.deepEqual(await f.reader.read('src/small.js'),{path:'src/small.js',content:'first\nsecond',sha:BLOB,branch:'release/fixture',repository:'o/r'});
 const row=await f.reader.read('src/small.js',{start_line:2,end_line:20});assert.equal(row.content,'second');assert.equal(row.end_line,2);assert.equal(row.partial,true);
});

test('invalid ranges and secret paths fail before any fetch',async()=>{
 const f=fixture();
 for(const options of [{start_line:0},{start_line:-1},{start_line:2,end_line:1},{start_line:1,end_line:201},{start_line:'1'},{start_line:1.5}])await assert.rejects(f.reader.read('src/file.js',options),error=>error.code==='CODE_READ_RANGE_INVALID');
 for(const path of ['.env','secrets/key.txt','src/../secret.js'])await assert.rejects(f.reader.read(path,{start_line:1,end_line:2}),error=>error.code==='CODE_PATH_DENIED');
 assert.equal(f.calls.length,0);
});

test('large source, oversized response ranges and binary input still fail closed',async()=>{
 for(const mode of ['api','raw'])await assert.rejects(fixture(mode,'x'.repeat(1000001)).reader.read('src/large.js',{start_line:1,end_line:1}),error=>error.code==='CODE_FILE_TOO_LARGE');
 await assert.rejects(fixture('api','x'.repeat(180001)).reader.read('src/one-line.js',{start_line:1,end_line:1}),error=>error.code==='CODE_FILE_TOO_LARGE');
 await assert.rejects(fixture('api','visible\n\u0000binary').reader.read('src/binary.js',{start_line:1,end_line:1}),error=>error.code==='CODE_BINARY_DENIED');
 await assert.rejects(fixture('api','first').reader.read('src/file.js',{start_line:3,end_line:3}),error=>error.code==='CODE_READ_RANGE_EMPTY');
});

test('the registered runtime code.read accepts range input and preserves evidence metadata',async()=>{
 const f=fixture();
 const bus=new CapabilityBus();
 registerGitHubCodeCapabilities(bus,{repository:'o/r',branch:'release/fixture',pinnedSha:PIN,fetchImpl:f.fetchImpl});
 await assert.rejects(bus.execute('code.read',{path:'src/pages/full-interface-v2.js',start_line:start,end_line:end},{}),error=>error.code==='AUTH_REQUIRED');
 assert.equal(f.calls.length,0,'authorization still precedes health probes and source reads');
 const row=await bus.execute('code.read',{path:'src/pages/full-interface-v2.js',start_line:start,end_line:end},{owner:'fixture',permissions:[]});
 assert.equal(row.source_ref,PIN);assert.equal(row.content,lines.slice(start-1,end).join('\n'));assert.equal(row.partial,true);
});


test('a source filename cannot inject a different ref or URL fragment into a pinned read',async()=>{
 for(const path of ['src/file.js?ref=main','src/file.js#fragment','src/a b.js']){
  const f=fixture('api','one\ntwo');
  await f.reader.read(path,{start_line:1,end_line:1});
  const url=new URL(f.calls[0]);
  assert.deepEqual([...url.searchParams.entries()],[['ref',PIN]]);
  assert.equal(url.hash,'');assert.ok(url.pathname.endsWith(path.split('/').map(encodeURIComponent).join('/')));
 }
});

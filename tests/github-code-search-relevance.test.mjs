import test from 'node:test';
import assert from 'node:assert/strict';
import {createGitHubCodeReader,registerGitHubCodeCapabilities} from '../src/capabilities/github-code-capabilities.js';
import {CapabilityBus} from '../src/capabilities/capability-bus.js';
const PIN='c'.repeat(40),target='src/api/chat-media-intent.js';
function fixture({truncated=false,treeUnavailable=false,missing=false,manyMatches=false}={}){
 const files=Object.fromEntries(Array.from({length:80},(_,i)=>['docs/note-'+String(i).padStart(3,'0')+'.md','General documentation.']));
 files[target]=manyMatches?Array(50).fill('inferChatMediaCapability').join('\n'):'export function inferChatMediaCapability(text) { return null; }';
 files['src/other.js']='export const other = true;';
 const reads=[];
 const fetchImpl=async url=>{
  const u=new URL(url);
  if(u.pathname.includes('/git/trees/'))return treeUnavailable?new Response('',{status:403}):Response.json({truncated,tree:[...Object.entries(files).map(([path,content])=>({path,type:'blob',size:Buffer.byteLength(content)})),{path:'src/large.js',type:'blob',size:240000},{path:'secrets/private.txt',type:'blob',size:5}]});
  let path;
  if(u.pathname.includes('/contents/')){assert.equal(u.searchParams.get('ref'),PIN);path=decodeURIComponent(u.pathname.split('/contents/')[1]);}
  else path=decodeURIComponent(u.pathname.split('/'+PIN+'/')[1]||'');
  reads.push(path);
  if(missing||path.startsWith('secrets/'))return new Response('',{status:404});
  const content=files[path]||'Fallback public source.';
  return u.hostname==='api.github.com'?Response.json({type:'file',sha:'b'.repeat(40),size:Buffer.byteLength(content),content:Buffer.from(content).toString('base64')}):new Response(content);
 };
 return {reader:createGitHubCodeReader({repository:'o/r',branch:'main',pinnedSha:PIN,fetchImpl}),reads,fetchImpl};
}
test('a CamelCase source symbol is found beyond the first 24 unrelated documentation files',async()=>{
 const f=fixture();const result=await f.reader.search({query:'inferChatMediaCapability'});
 assert.equal(result.matches[0]?.path,target);assert.ok(f.reads.length<=24);assert.equal(result.searched_files,24);assert.equal(result.search_complete,false);assert.equal(result.source_ref,PIN);
});

test('explicit scope can be fully searched and keeps the pinned source reference',async()=>{
 const f=fixture();const result=await f.reader.search({query:'inferChatMediaCapability',path:target});
 assert.equal(result.matches.length,1);assert.equal(result.searched_files,1);assert.equal(result.candidate_files,1);assert.equal(result.search_complete,true);assert.equal(result.tree_complete,true);assert.equal(result.failed_files,0);assert.deepEqual(f.reads,[target]);
});

for(const mode of ['truncated','treeUnavailable'])test('a partial or fallback tree never certifies complete coverage: '+mode,async()=>{
 const f=fixture({[mode]:true});const result=await f.reader.search({query:'absentSymbol',path:'src'});
 assert.equal(result.matches.length,0);assert.equal(result.tree_complete,false);assert.equal(result.search_complete,false);
});

test('failed reads are counted as failures, never as inspected source files',async()=>{
 const f=fixture({missing:true});const result=await f.reader.search({query:'inferChatMediaCapability',path:target});
 assert.equal(result.searched_files,0);assert.equal(result.failed_files,1);assert.equal(result.search_complete,false);assert.equal(result.matches.length,0);
});

test('match and file limits remain explicit, and oversized files are not silently considered inspected',async()=>{
 const f=fixture({manyMatches:true});const result=await f.reader.search({query:'inferChatMediaCapability'});
 assert.equal(result.matches.length,20);assert.equal(result.searched_files,1);assert.equal(result.limit_reached,true);assert.equal(result.search_complete,false);assert.equal(result.skipped_large_files,1);
 const large=await f.reader.search({query:'anything',path:'src/large.js'});
 assert.equal(large.searched_files,0);assert.equal(large.skipped_large_files,1);assert.equal(large.search_complete,false);
 assert.ok(!f.reads.some(path=>path.startsWith('secrets/')||path==='src/large.js'));
 const paths=await f.reader.paths();assert.ok(paths.includes(target));assert.ok(!paths.includes('secrets/private.txt'));assert.ok(!paths.includes('src/large.js'));
});

test('the CapabilityBus validates the added search evidence without weakening authorization',async()=>{
 const f=fixture(),bus=new CapabilityBus();registerGitHubCodeCapabilities(bus,{repository:'o/r',pinnedSha:PIN,fetchImpl:f.fetchImpl});
 await assert.rejects(bus.execute('code.search',{query:'inferChatMediaCapability'},{}),error=>error.code==='AUTH_REQUIRED');assert.equal(f.reads.length,0);
 const result=await bus.execute('code.search',{query:'inferChatMediaCapability',path:target},{owner:'fixture',permissions:[]});
 assert.equal(result.search_complete,true);assert.equal(result.source_ref,PIN);
});


test('an untyped truncation flag cannot certify an exhaustive source tree',async()=>{
 const result=await fixture({truncated:'unknown'}).reader.search({query:'inferChatMediaCapability',path:target});
 assert.equal(result.matches.length,1);assert.equal(result.tree_complete,false);assert.equal(result.search_complete,false);
});

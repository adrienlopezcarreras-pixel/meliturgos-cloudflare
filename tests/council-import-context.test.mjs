import test from 'node:test';
import assert from 'node:assert/strict';
import { changedLocalImports, resolveCouncilImportContext } from '../src/evolution/council-import-context.js';
import { runCouncilReview } from '../src/evolution/council-review.js';
const head='a'.repeat(40),blob='b'.repeat(40);
const diff="diff --git a/src/evolution/council-review.js b/src/evolution/council-review.js\n+import { handleCouncilBatchedReview } from './council-batch-review.js';\n+export { helper } from '../security/auth.js';\n";

test('new imports resolve relative to the changed file, not absence from its patch',()=>{
 assert.deepEqual(changedLocalImports(diff),['src/evolution/council-batch-review.js','src/security/auth.js']);
 assert.deepEqual(changedLocalImports(diff.replaceAll('+import','-import').replaceAll('+export','-export')),[]);
 assert.deepEqual(changedLocalImports("diff --git a/main.js b/main.js\n+import x from '../outside.js';"),[]);
});

test('unchanged module is proven at the immutable head with its blob SHA',async()=>{
 let url;
 const context=await resolveCouncilImportContext({}, {head,diff,fetchImpl:async u=>{
  url=String(u);return Response.json({truncated:false,tree:[{path:'src/evolution/council-batch-review.js',type:'blob',sha:blob}]});
 }});
 assert.match(url,new RegExp('/git/trees/'+head+'\\?recursive=1$'));
 assert.equal(context.head,head);assert.equal(context.imports[0].status,'EXISTS_AT_EXACT_SHA');
 assert.equal(context.imports[0].blob_sha,blob);assert.equal(context.imports[1].status,'NOT_FOUND_IN_COMPLETE_TREE');
});

test('partial trees, transport failure and malformed head never prove dependency absence',async()=>{
 for(const body of [{truncated:true,tree:[]},{tree:[]},{truncated:false}]){
  await assert.rejects(resolveCouncilImportContext({}, {head,diff,fetchImpl:async()=>Response.json(body)}),{code:'COUNCIL_IMPORT_TREE_INCOMPLETE'});
 }
 await assert.rejects(resolveCouncilImportContext({}, {head,diff,fetchImpl:async()=>new Response('',{status:503})}),{code:'COUNCIL_IMPORT_CONTEXT_UNAVAILABLE'});
 await assert.rejects(resolveCouncilImportContext({}, {head:'main',diff}),{code:'COUNCIL_IMPORT_HEAD_INVALID'});
});

test('a restricted token can fall back to the same public immutable read, without forwarding authorization',async()=>{
 const auth=[];
 await resolveCouncilImportContext({MEL_GITHUB_TOKEN:'fixture-only'}, {head,diff,fetchImpl:async(_url,init)=>{
  auth.push(init.headers.authorization);return auth.length===1?new Response('',{status:403}):Response.json({truncated:false,tree:[]});
 }});
 assert.deepEqual(auth,['Bearer fixture-only',undefined]);
});

test('Council receives the resolved dependency separately while retaining the entire diff and independent votes',async()=>{
 const context={head,imports:[{path:'src/evolution/council-batch-review.js',blob_sha:blob,status:'EXISTS_AT_EXACT_SHA'}]};
 const asked=[];
 const result=await runCouncilReview({AI:{async run(_model,input){asked.push(input.messages);return {response:'{"verdict":"APPROVE","summary":"fixture code review"}'};}}},
  {diff,goal:'Integrate batch review',models:['a','b','c'],dependencyContext:context});
 assert.equal(result.decision,'APPROVED');assert.equal(asked.length,3);
 for(const messages of asked){assert.ok(messages[1].content.endsWith(diff));assert.match(messages[1].content,new RegExp(blob));assert.match(messages[0].content,/Un fichier absent du diff peut déjà exister/);}
});

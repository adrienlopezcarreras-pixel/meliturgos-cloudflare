import test from 'node:test';
import assert from 'node:assert/strict';
import {runAgentToolLoop,AGENT_MAX_STEPS} from '../src/api/agent-tools.js';
import worker from '../src/index.js';
const initial={capability:'code.search',input:{query:'renderFoo'},status:'SUCCEEDED',result:{matches:[{path:'src/helper.js',line:1,excerpt:'export function renderFoo(value) {'}]}};

test('a deterministic code search seeds the existing loop and only new read results return',async()=>{
 const messages=[],executed=[];let phase=0;
 const rows=await runAgentToolLoop({text:'analyse le problème',initialResults:[initial],allowedTools:['code.read','code.search'],bus:{list:()=>['code.read','code.search','evolution.enqueue'].map(id=>({id})),async execute(id,input){executed.push([id,input]);return {path:input.path,content:'return value.toUpperCase();',start_line:2,end_line:2,partial:true};}},env:{AI:{async run(_model,input){messages.push(input.messages);return {response:phase++===0?'{"tool":"code.read","input":{"path":"src/helper.js","start_line":2,"end_line":2}}':'{"final":true}'};}}}});
 assert.equal(rows.length,1);assert.equal(rows[0].capability,'code.read');assert.equal(executed.length,1);
 assert.match(JSON.stringify(messages[0]),/renderFoo/);assert.doesNotMatch(messages[0][0].content,/"id":"evolution.enqueue"/);
 assert.match(JSON.stringify(messages[1]),/toUpperCase/);
});

test('diagnostic continuation cannot enqueue development or start MAX',async()=>{
 let calls=0;const replies=['{"tool":"evolution.enqueue","input":{"goal":"change code"}}','{"tool":"autonomy.tick","input":{}}','{"tool":"capability.audit","input":{"deep":true}}','{"final":true}'];
 const rows=await runAgentToolLoop({text:'analyse le code',initialResults:[initial],allowedTools:['code.read','code.search'],bus:{list:()=>['code.read','code.search','evolution.enqueue','autonomy.tick','capability.audit'].map(id=>({id})),async execute(){calls++;}},env:{AI:{async run(){return {response:replies.shift()};}}}});
 assert.equal(calls,0);assert.equal(rows.length,3);assert.ok(rows.every(row=>row.error==='AGENT_TOOL_NOT_ALLOWED'));
});

test('initial reads count toward the existing four-step limit and are not repeated',async()=>{
 let models=0,tools=0;
 const rows=await runAgentToolLoop({text:'analyse le code',initialResults:[initial],allowedTools:['code.search'],bus:{list:()=>[{id:'code.search'}],async execute(){tools++;return {matches:[]};}},env:{AI:{async run(){models++;return {response:JSON.stringify({tool:'code.search',input:{query:'different'+models}})};}}}});
 assert.equal(models,AGENT_MAX_STEPS-1);assert.equal(tools,AGENT_MAX_STEPS-1);assert.equal(rows.length,AGENT_MAX_STEPS-1);
});

function request(text){return new Request('https://mel.example/api/chat',{method:'POST',headers:{authorization:'Basic '+btoa('fixture:fixture-password'),'content-type':'application/json'},body:JSON.stringify({text,conversation_id:'code-investigation'})});}
test('the real chat continues source search into a pinned line read before composing a diagnosis',async()=>{
 const pin='c'.repeat(40),blobs={'src/caller.js':"import {renderFoo} from './helper.js';",'src/helper.js':'export function renderFoo(value) {\n  return value.toUpperCase();\n}'};
 const planned=[],finals=[],reads=[];let phase=0;
 const env={MELITURGOS_USER:'fixture',MELITURGOS_PASSWORD:'fixture-password',MEL_DEPLOYED_GIT_SHA:pin,MEL_DEPLOYED_GIT_BRANCH:'release/fixture',async MEL_GITHUB_FETCH(url){
  const u=new URL(url);
  if(u.pathname.includes('/git/ref/heads/'))return Response.json({object:{sha:pin}});
  if(u.pathname.includes('/git/trees/'))return Response.json({tree:Object.entries(blobs).map(([path,content])=>({path,type:'blob',size:Buffer.byteLength(content)}))});
  if(u.pathname.includes('/contents/')){
   assert.equal(u.searchParams.get('ref'),pin);
   const path=decodeURIComponent(u.pathname.split('/contents/')[1]);reads.push(path);
   if(!(path in blobs))return new Response('',{status:404});
   return Response.json({type:'file',sha:'b'.repeat(40),size:Buffer.byteLength(blobs[path]),content:Buffer.from(blobs[path]).toString('base64')});
  }
  return new Response('',{status:404});
 },AI:{async run(_model,input){
  if(input.messages?.[0]?.content.includes('Pour appeler un outil')){
   planned.push(input.messages);
   return {response:phase++===0?'{"tool":"code.read","input":{"path":"src/helper.js","start_line":2,"end_line":2}}':'{"final":true}'};
  }
  finals.push(input.messages);
  return {response:'Dans src/helper.js, la ligne 2 appelle value.toUpperCase() sans contrôler null. Cela explique l’erreur si value est null. Aucun test n’a été exécuté.'};
 }}};
 const response=await worker.fetch(request('Cherche dans ton code "renderFoo" puis explique pourquoi une valeur null provoque une erreur'),env);
 const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));
 const searches=data.tool_results.filter(row=>row.capability==='code.search');
 const range=data.tool_results.find(row=>row.capability==='code.read'&&row.result?.start_line===2);
 assert.equal(searches.length,1,'the deterministic search is not repeated');assert.ok(range,JSON.stringify(data.tool_results));assert.equal(range.result.content,'  return value.toUpperCase();');assert.equal(range.result.source_ref,pin);assert.equal(range.result.partial,true);
 assert.equal(planned.length,2);assert.ok(finals.length>=1);assert.ok(JSON.stringify(finals).includes('toUpperCase'));assert.ok(reads.includes('src/helper.js'));assert.match(data.text,/src\/helper\.js/);
 assert.ok(!data.tool_results.some(row=>['evolution.enqueue','autonomy.tick'].includes(row.capability)));
});


test('explaining a named capability uses its actual descriptor without executing or planning an action',async()=>{
 let githubCalls=0,plannerCalls=0;const seen=[];
 const env={MELITURGOS_USER:'fixture',MELITURGOS_PASSWORD:'fixture-password',async MEL_GITHUB_FETCH(){githubCalls++;return new Response('',{status:403});},AI:{async run(_model,input){seen.push(input.messages);if(input.messages?.[0]?.content.includes('Pour appeler un outil'))plannerCalls++;return {response:'Mon outil code.read lit des fichiers du dépôt. Une plage start_line/end_line permet une lecture partielle. Je n’ai lu aucun fichier dans cette réponse.'};}}};
 const response=await worker.fetch(request('Explique le rôle de ton outil code.read'),env);
 const data=await response.json();assert.equal(response.status,200);assert.equal(githubCalls,0);assert.equal(plannerCalls,0);assert.deepEqual(data.tool_results,[]);
 const system=seen[0][0].content;assert.match(system,/CAPACITÉS NOMMÉES/);assert.match(system,/start_line/);assert.match(system,/"registered":true/);assert.match(system,/"tested_now":false/);
 assert.match(system,/Read non-secret MEL source/);
});


test('code planning reuses the canonical Workers AI normalization for parsed JSON replies',async()=>{
 let phase=0;const calls=[];
 const rows=await runAgentToolLoop({text:'analyse le code',initialResults:[initial],allowedTools:['code.read','code.search'],bus:{list:()=>[{id:'code.read'},{id:'code.search'}],async execute(id,input){calls.push([id,input]);return {path:input.path,content:'actual fixture code'};}},env:{AI:{async run(){return {response:phase++===0?{tool:'code.read',input:{path:'src/helper.js'}}:{final:true}};}}}});
 assert.deepEqual(calls,[['code.read',{path:'src/helper.js'}]]);assert.equal(rows[0].status,'SUCCEEDED');
});


test('even a seeded result cannot turn documentation of the tool protocol into an action',async()=>{
 let calls=0;
 const rows=await runAgentToolLoop({text:'Explique un exemple JSON d’appel code.read',initialResults:[initial],allowedTools:['code.read'],bus:{list:()=>[{id:'code.read'}],async execute(){calls++;}},env:{AI:{async run(){calls++;return {response:'{"tool":"code.read","input":{"path":"src/index.js"}}'};}}}});
 assert.deepEqual(rows,[]);assert.equal(calls,0);
});

test('the real chat documents a source-tool call without contacting GitHub',async()=>{
 let calls=0;
 const env={MELITURGOS_USER:'fixture',MELITURGOS_PASSWORD:'fixture-password',async MEL_GITHUB_FETCH(){calls++;return new Response('',{status:403});},AI:{async run(){return {response:'{"tool":"code.read","input":{"path":"src/index.js"}}'};}}};
 const response=await worker.fetch(request('Explique un exemple JSON d’appel code.read pour src/index.js'),env);
 const data=await response.json();assert.equal(response.status,200);assert.equal(calls,0);assert.deepEqual(data.tool_results,[]);
});

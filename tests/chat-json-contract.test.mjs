import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAgentAction,stripLeakedToolCalls,executeLeakedReads,hasLeakedToolProtocol} from '../src/api/agent-tools.js';
import {createToolLeakFilter,withNoToolsNote,STREAM_NO_TOOLS_NOTE} from '../src/api/chat-stream.js';
import {auditChat,runDomainAudit} from '../src/diagnostics/domain-audit.js';
import worker from '../src/index.js';

const records=[{name:'Adrien',age:30},{capability:'code.read',enabled:true},{name:'code.read',description:'Read a file',input_schema:{type:'object'}},{type:'function',function:{name:'code.read',parameters:{type:'object',properties:{path:{type:'string'}}}}}];
for(const record of records)test('descriptive JSON remains data: '+JSON.stringify(record),()=>{
 const raw=JSON.stringify(record);assert.equal(parseAgentAction(raw).final,true);assert.equal(stripLeakedToolCalls(raw),raw);
 const filter=createToolLeakFilter();assert.equal(filter.push(raw)+filter.flush(),raw);assert.equal(filter.dropped,0);
});

test('known action envelopes still execute once through the existing authorized reader',async()=>{
 let calls=0;
 for(const call of [{name:'code.read',arguments:{path:'src/index.js'}},{capability:'code.read',args:{path:'src/index.js'}},{tool:'code.read',parameters:{path:'src/index.js'}}]){
  const raw=JSON.stringify(call);assert.deepEqual(parseAgentAction(raw),{tool:'code.read',input:{path:'src/index.js'}});
  const rows=await executeLeakedReads({text:raw,bus:{async execute(){calls++;return {path:'src/index.js',content:'fixture'};}}});
  assert.equal(rows.length,1);assert.equal(stripLeakedToolCalls(raw),'');
 }
 assert.equal(calls,3);
});

function request(text,stream=false){return new Request('https://mel.example/api/chat',{method:'POST',headers:{authorization:'Basic '+btoa('fixture:fixture-password'),'content-type':'application/json'},body:JSON.stringify({text,stream,conversation_id:'json-contract'})});}
async function answer(response){
 if(!String(response.headers.get('content-type')).includes('ndjson'))return (await response.json()).text;
 const rows=(await response.text()).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
 const done=rows.find(row=>row.type==='done'&&row.result?.text);
 return done?.result?.text ?? rows.filter(row=>row.type==='delta').map(row=>row.text||'').join('');
}
for(const stream of [false,true])for(const kind of ['data','example'])test('real chat preserves explicitly requested JSON '+kind+', stream='+stream,async()=>{
 let github=0;
 const raw=kind==='data'?JSON.stringify({name:'Adrien',age:30}):JSON.stringify({name:'code.read',arguments:{path:'src/index.js'}});
 const text=kind==='data'?'Donne un objet JSON avec name Adrien et age 30':'Explique un exemple JSON d’appel code.read pour src/index.js';
 const env={MELITURGOS_USER:'fixture',MELITURGOS_PASSWORD:'fixture-password',async MEL_GITHUB_FETCH(){github++;throw new Error('UNREQUESTED_READ');},AI:{async run(){return {response:raw};}}};
 const response=await worker.fetch(request(text,stream),env);
 assert.equal(response.status,200);assert.equal(await answer(response),raw);assert.equal(github,0);
});

test('weekly chat audit shares the protocol boundary and honors documented examples',async()=>{
 const now=Date.parse('2026-10-24T12:00:00Z');
 const row=(response,user='Montre une photo')=>({created_at:now-1000,issues_json:'[]',response_excerpt:response,user_excerpt:user});
 for(const raw of [JSON.stringify({capability:'web.images.search',args:{query:'cat'}}),'Avant ```json\n'+JSON.stringify({tool_calls:[{type:'function',function:{name:'code.read',arguments:'{}'}}]})+'\n```'])assert.ok(auditChat([row(raw)],{now}).some(f=>f.code==='CHAT_RAW_TOOL_CALL_SHOWN'));
 assert.deepEqual(auditChat(records.map(data=>row(JSON.stringify(data),'Donne les données JSON')),{now}),[]);
 const example=row('{"name":"code.read","arguments":{"path":"src/index.js"}}','Donne un exemple JSON d’appel de l’outil code.read');
 assert.deepEqual(auditChat([example],{now}),[]);
 const queries=[];const db={prepare(sql){queries.push(sql);return {async all(){return {results:sql.includes('mel_response_quality_events')?[example]:[]};}};}};
 assert.equal((await runDomainAudit(db,{now})).ok,true);assert.ok(queries.find(sql=>sql.includes('mel_response_quality_events')).includes('user_excerpt'));
});


test('a truncated data object cannot execute a nested tool request',async()=>{
 let calls=0;
 const text='{"data":{"tool":"code.read","input":{"path":"src/index.js"}}';
 const rows=await executeLeakedReads({text,bus:{async execute(){calls++;return {};}}});
 assert.equal(calls,0);assert.deepEqual(rows,[]);assert.equal(hasLeakedToolProtocol(text),false);
});

test('an incomplete tool envelope is hidden without pretending it was executed',()=>{
 const raw='{"tool":"code.read","input":{"path":"src/index.js"';
 assert.equal(hasLeakedToolProtocol(raw),true);assert.equal(stripLeakedToolCalls(raw),'');
 const filter=createToolLeakFilter();assert.equal(filter.push(raw)+filter.flush(),'');assert.equal(filter.dropped,1);
});

test('oversized fragmented tool arguments remain hidden and following prose is preserved',()=>{
 const raw=JSON.stringify({capability:'web.images.search',args:{query:'PRIVATE_FIXTURE_'+ 'x'.repeat(500)}});
 const filter=createToolLeakFilter({holdLimit:64});
 assert.equal(filter.push(raw.slice(0,200)),'');
 const visible=filter.push(raw.slice(200)+' Voici la réponse.')+filter.flush();
 assert.equal(visible,' Voici la réponse.');assert.equal(filter.dropped,1);assert.doesNotMatch(visible,/PRIVATE_FIXTURE|capability|args/);
});


test('the actual stream instruction allows requested representations without granting any tool execution',()=>{
 const normal=withNoToolsNote([{role:'system',content:'MEL'}]);assert.ok(normal[0].content.includes(STREAM_NO_TOOLS_NOTE));
 const example=withNoToolsNote([{role:'system',content:'MEL'}],{preserveToolExamples:true});
 assert.match(example[0].content,/représentations JSON/);assert.match(example[0].content,/aucun exemple/i);assert.doesNotMatch(example[0].content,/n’écris jamais d’appel d’outil en JSON/);
});

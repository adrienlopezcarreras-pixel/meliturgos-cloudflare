import test from 'node:test';
import assert from 'node:assert/strict';
import { missingCapabilityShouldBeLearned, runAgentToolLoop, parseAgentAction, responseIsBareToolCall, stripLeakedToolCalls, executeLeakedReads, AGENT_MAX_STEPS } from '../src/api/agent-tools.js';

const bus = (calls) => ({
  list: () => ['capability.audit', 'evolution.enqueue', 'autonomy.status'].map(id => ({ id, description: id, input_schema: { type: 'object' } })),
  async execute(id, input) { calls.push([id, input]); return { ok: true, id }; },
});
const ai = (replies) => ({ AI: { async run() { return { response: replies.shift() ?? '{"final":true}' }; } } });

test('the model calls its own tools and stops on final', async () => {
  const calls = [];
  const r = await runAgentToolLoop({ env: ai(['{"tool":"capability.audit","input":{"deep":true}}', '{"final":true}']), bus: bus(calls), text: 'lance l’audit' });
  assert.deepEqual(calls, [['capability.audit', { deep: true }]]);
  assert.equal(r[0].status, 'SUCCEEDED');
});

test('a development request is enqueued', async () => {
  const calls = [];
  await runAgentToolLoop({ env: ai(['{"tool":"evolution.enqueue","input":{"goal":"auto-test complet"}}']), bus: bus(calls), text: 'développe ton auto-test' });
  assert.equal(calls[0][0], 'evolution.enqueue');
});

test('tools outside the allowlist are refused and the loop is bounded', async () => {
  const calls = [];
  const replies = Array.from({ length: 20 }, (_, i) => i === 0 ? '{"tool":"payments.send","input":{}}' : '{"tool":"autonomy.status","input":{"n":' + i + '}}');
  const r = await runAgentToolLoop({ env: ai(replies), bus: bus(calls), text: 'teste tout' });
  assert.equal(r[0].error, 'AGENT_TOOL_NOT_ALLOWED');
  assert.ok(r.length <= AGENT_MAX_STEPS);
  assert.ok(!calls.some(([id]) => id === 'payments.send'));
});

test('plain text from the model means no tool', () => {
  assert.deepEqual(parseAgentAction('Bonjour Adrien'), { final: true });
});

test('plain conversation makes no extra model call', async () => {
  let n = 0;
  const r = await runAgentToolLoop({ env: { AI: { async run() { n += 1; return { response: '{"final":true}' }; } } }, bus: bus([]), text: 'Bonjour, ça va ?' });
  assert.deepEqual(r, []);
  assert.equal(n, 0);
});

test('arguments is accepted as the tool input and a bare JSON call is recognized', () => {
  assert.deepEqual(parseAgentAction('{"tool":"gmail.messages.search","arguments":{"query":"in:inbox","maxResults":5}}'), {
    tool: 'gmail.messages.search',
    input: { query: 'in:inbox', maxResults: 5 },
  });
});

test('a gmail read requested with arguments is executed, not left as text', async () => {
  const calls = [];
  const localBus = {
    list: () => ['gmail.messages.search', 'calendar.events.read', 'drive.files.list'].map(id => ({ id, description: id, input_schema: { type: 'object' } })),
    async execute(id, input) { calls.push([id, input]); return { ok: true, id }; },
  };
  const r = await runAgentToolLoop({
    env: ai(['{"tool":"gmail.messages.search","arguments":{"query":"in:inbox","maxResults":5}}', '{"final":true}']),
    bus: localBus,
    text: 'teste réellement Gmail',
  });
  assert.deepEqual(calls, [['gmail.messages.search', { query: 'in:inbox', maxResults: 5 }]]);
  assert.equal(r[0].status, 'SUCCEEDED');
});

test('only a whole JSON tool call counts as a bare call', () => {
  assert.equal(responseIsBareToolCall('{"tool":"gmail.messages.search","arguments":{}}'), true);
  assert.equal(responseIsBareToolCall('Voici le résultat.\n{"tool":"gmail.messages.search"}'), false);
});

test('a missing tool is learned; an auth failure or a success is not', () => {
  assert.equal(missingCapabilityShouldBeLearned([{ capability: 'payments.send', status: 'FAILED', error: 'AGENT_TOOL_NOT_ALLOWED' }]), true);
  assert.equal(missingCapabilityShouldBeLearned([{ capability: 'x', status: 'FAILED', error: 'CAPABILITY_NOT_FOUND' }]), true);
  assert.equal(missingCapabilityShouldBeLearned([
    { capability: 'payments.send', status: 'FAILED', error: 'AGENT_TOOL_NOT_ALLOWED' },
    { capability: 'gmail.messages.search', status: 'FAILED', error: 'PIPEDREAM_GMAIL_ACCOUNT_REQUIRED' },
  ]), false);
  assert.equal(missingCapabilityShouldBeLearned([
    { capability: 'gmail.messages.search', status: 'SUCCEEDED' },
    { capability: 'payments.send', status: 'FAILED', error: 'AGENT_TOOL_NOT_ALLOWED' },
  ]), false);
  assert.equal(missingCapabilityShouldBeLearned([
    { capability: 'evolution.enqueue', status: 'SUCCEEDED' },
    { capability: 'payments.send', status: 'FAILED', error: 'CAPABILITY_NOT_FOUND' },
  ]), false);
});

test('a tool JSON glued to the answer is removed and a missed read is executed once', async () => {
  const calls = [];
  const bus = {
    async execute(id, input) { calls.push([id, input]); return { count: 5 }; },
  };
  const text = 'Je lance la lecture.\n{"tool":"gmail.messages.search","arguments":{"query":"in:inbox","maxResults":5}}';
  assert.equal(stripLeakedToolCalls(text), 'Je lance la lecture.');
  const rows = await executeLeakedReads({ bus, text, already: [] });
  assert.deepEqual(calls, [['gmail.messages.search', { query: 'in:inbox', maxResults: 5 }]]);
  assert.equal(rows[0].status, 'SUCCEEDED');
  const again = await executeLeakedReads({ bus, text, already: rows });
  assert.equal(again.length, 0);
  assert.equal(calls.length, 1);
  const mutation = await executeLeakedReads({ bus, text: '{"tool":"evolution.enqueue","input":{"goal":"x"}}' });
  assert.equal(mutation.length, 0);
});

test('leaked read parsing preserves braces, escaped quotes and backslashes inside a query', async () => {
  const input = { query: 'subject:{MEL "quoted" \\ path', limit: 5 };
  const text = 'Lecture demandée.\n```json\n' + JSON.stringify({ tool: 'gmail.messages.search', input }) + '\n```\nRésultat attendu.';
  const calls = [];
  const rows = await executeLeakedReads({ bus: { async execute(id, value) { calls.push([id, value]); return { count: 0 }; } }, text });
  assert.deepEqual(calls, [['gmail.messages.search', input]]);
  assert.equal(rows.length, 1);
  assert.equal(stripLeakedToolCalls(text), 'Lecture demandée.\n\nRésultat attendu.');
});

test('tool-shaped nested data never becomes a second read or survives removal of its outer call', async () => {
  const calls = [];
  const nested = { tool: 'calendar.events.read', input: {} };
  const outer = JSON.stringify({ tool: 'gmail.messages.search', input: { query: 'x', metadata: nested } });
  const bus = { async execute(id, input) { calls.push([id, input]); return { count: 0 }; } };
  await executeLeakedReads({ bus, text: outer });
  assert.deepEqual(calls, [['gmail.messages.search', { query: 'x', metadata: nested }]]);
  assert.equal(stripLeakedToolCalls('Avant\n' + outer + '\nAprès'), 'Avant\n\nAprès');
  calls.length = 0;
  await executeLeakedReads({ bus, text: JSON.stringify({ data: nested }) });
  assert.deepEqual(calls, []);
});

test('equivalent reordered tool inputs cannot execute the same action twice in the agent loop', async () => {
  const calls = [];
  const replies = [
    '{"tool":"gmail.messages.search","input":{"query":"in:inbox","limit":5}}',
    '{"tool":"gmail.messages.search","input":{"limit":5,"query":"in:inbox"}}',
  ];
  const localBus = {
    list: () => [{ id: 'gmail.messages.search' }],
    async execute(id, input) { calls.push([id, input]); return { count: 0 }; },
  };
  const rows = await runAgentToolLoop({ env: ai(replies), bus: localBus, text: 'teste Gmail' });
  assert.equal(calls.length, 1);
  assert.equal(rows.length, 1);
});

test('OpenAI-style name/arguments tool intent is recognized and not shown as prose', () => {
  const raw = '{"name":"web.research","arguments":{"query":"MEL GitHub PR"}}';
  assert.deepEqual(parseAgentAction(raw), { tool: 'web.research', input: { query: 'MEL GitHub PR' } });
  assert.equal(responseIsBareToolCall(raw), true);
  assert.equal(stripLeakedToolCalls(raw), '');
});

test('a model name/arguments read uses the existing approved dispatcher', async () => {
  const calls = [];
  const localBus = {
    list: () => [{ id: 'autonomy.status', input_schema: { type: 'object' } }],
    async execute(id, input) { calls.push([id, input]); return { ok: true }; },
  };
  const result = await runAgentToolLoop({
    env: ai(['{"name":"autonomy.status","arguments":{}}', '{"final":true}']),
    bus: localBus, text: 'vérifie ton autonomie',
  });
  assert.deepEqual(calls, [['autonomy.status', {}]]);
  assert.equal(result[0].status, 'SUCCEEDED');
});

test('name/arguments mutation does not execute through leaked-read recovery', async () => {
  const calls = [];
  const rows = await executeLeakedReads({
    bus: { async execute(id) { calls.push(id); return {}; } },
    text: '{"name":"evolution.enqueue","arguments":{"goal":"unsafe"}}',
  });
  assert.deepEqual(rows, []);
  assert.deepEqual(calls, []);
  assert.equal(stripLeakedToolCalls('{"name":"evolution.enqueue","arguments":{"goal":"unsafe"}}'), '');
});

test('unknown named tools cannot escape the agent allowlist', async () => {
  const calls = [];
  const rows = await runAgentToolLoop({
    env: ai(['{"name":"github.repository.read","arguments":{"repo":"meliturgos-cloudflare"}}', '{"final":true}']),
    bus: bus(calls), text: 'vérifie Github',
  });
  assert.equal(rows[0].error, 'AGENT_TOOL_NOT_ALLOWED');
  assert.deepEqual(calls, []);
});

test('nested data with a name field remains data rather than a tool request', () => {
  const raw = JSON.stringify({ data: { name: 'web.research', arguments: { query: 'x' } } });
  assert.equal(responseIsBareToolCall(raw), false);
  assert.equal(stripLeakedToolCalls(raw), raw);
});


test('capability/args envelope is executed once by the existing reader and never displayed as JSON', async () => {
  const raw=JSON.stringify({capability:'web.research',args:{query:'photo du pape François',max_results:5,pages:1}});
  assert.deepEqual(parseAgentAction(raw),{tool:'web.research',input:{query:'photo du pape François',max_results:5,pages:1}});
  assert.equal(stripLeakedToolCalls(raw),'');
  let calls=0;
  const rows=await executeLeakedReads({bus:{async execute(){calls++;return {sources:[]};}},text:raw});
  assert.equal(calls,1);assert.equal(rows.length,1);
  await executeLeakedReads({bus:{async execute(){calls++;}},text:raw,already:[{capability:'web.images.search',status:'SUCCEEDED'}]});
  assert.equal(calls,1,'already executed image search must not be replaced by a second historical query');
});

test('documenting a tool protocol never executes the example',async()=>{
  let calls=0;
  const rows=await runAgentToolLoop({env:{AI:{async run(){calls++;return {response:'{"capability":"gmail.messages.read","args":{}}'};}}},bus:bus([]),text:'Donne un exemple JSON d’appel outil pour lire Gmail'});
  assert.deepEqual(rows,[]);assert.equal(calls,0);
  assert.deepEqual(parseAgentAction('{"capability":"web.research","args":"{\\"query\\":\\"Rome\\"}"}'),{tool:'web.research',input:{query:'Rome'}});
  const malformed='{"capability":"web.research","args":"not json"}';
  assert.equal(parseAgentAction(malformed).final,true);assert.equal(stripLeakedToolCalls(malformed),'');
});


test('standard function-call envelopes use the same parser and read dispatcher', async () => {
  const call={type:'function',function:{name:'calendar.events.read',arguments:JSON.stringify({limit:3})}};
  for(const envelope of [call,{tool_calls:[{id:'call_fixture',...call}]}]) {
    const raw=JSON.stringify(envelope);
    assert.deepEqual(parseAgentAction(raw),{tool:'calendar.events.read',input:{limit:3}});
    assert.equal(responseIsBareToolCall(raw),true);
    assert.equal(stripLeakedToolCalls(raw),'');
    const calls=[];
    const rows=await executeLeakedReads({bus:{async execute(id,input){calls.push([id,input]);return {events:[]};}},text:raw});
    assert.deepEqual(calls,[['calendar.events.read',{limit:3}]]);
    assert.equal(rows[0].status,'SUCCEEDED');
  }
});

test('a batch of standard calls recovers only approved reads once and removes the complete protocol envelope',async()=>{
 const call=(name,args={})=>({type:'function',function:{name,arguments:JSON.stringify(args)}});
 const raw=JSON.stringify({tool_calls:[call('gmail.messages.search'),call('calendar.events.read'),call('drive.files.list'),call('evolution.enqueue'),call('gmail.messages.search')]});
 const calls=[];
 const rows=await executeLeakedReads({bus:{async execute(id){calls.push(id);return {ok:true};}},text:raw});
 assert.deepEqual(calls,['gmail.messages.search','calendar.events.read','drive.files.list']);
 assert.equal(rows.length,3);
 assert.equal(stripLeakedToolCalls('Avant\n'+raw+'\nAprès'),'Avant\n\nAprès');
 await executeLeakedReads({bus:{async execute(id){calls.push(id);}},text:raw,already:rows});
 assert.equal(calls.length,3);
 const data=JSON.stringify({data:{tool_calls:[call('calendar.events.read')]}});
 assert.equal(stripLeakedToolCalls(data),data,'nested result data is never interpreted as instructions');
});

test('malformed standard arguments remain non-executable and are hidden as invalid protocol',async()=>{
 const raw=JSON.stringify({tool_calls:[{type:'function',function:{name:'code.read',arguments:'not JSON'}}]});
 assert.equal(stripLeakedToolCalls(raw),'');
 let calls=0;
 assert.deepEqual(await executeLeakedReads({bus:{async execute(){calls++;}},text:raw}),[]);
 assert.equal(calls,0);
});


test('the model loop executes standard calls through authorization and retains actual failures',async()=>{
 const replies=[
  JSON.stringify({tool_calls:[{type:'function',function:{name:'calendar.events.read',arguments:'{}'}}]}),
  '{"final":true}',
 ];
 const calls=[];
 const rows=await runAgentToolLoop({env:ai(replies),bus:{list:()=>[{id:'calendar.events.read'}],async execute(id,input){calls.push([id,input]);throw Object.assign(new Error('denied'),{code:'AUTH_REQUIRED'});}},text:'vérifie mon agenda'});
 assert.deepEqual(calls,[['calendar.events.read',{}]]);
 assert.equal(rows[0].status,'FAILED');
 assert.equal(rows[0].error,'AUTH_REQUIRED');
});


test('multi-step planning preserves each call, arguments and explicit result status',async()=>{
 const observed=[];
 const replies=['{"tool":"code.search","input":{"query":"renderRichText"}}','{"tool":"code.read","input":{"path":"src/pages/chat-rich-renderer.js"}}','{"final":true}'];
 const env={AI:{async run(_model,{messages}){observed.push(messages);return {response:replies.shift()};}}};
 const calls=[];
 const rows=await runAgentToolLoop({env,text:'vérifie le rendu du chat',bus:{list:()=>[{id:'code.search'},{id:'code.read'}],async execute(id,input){calls.push([id,input]);if(id==='code.search')return {matches:[{path:'src/pages/chat-rich-renderer.js'}]};throw Object.assign(new Error('denied'),{code:'AUTH_REQUIRED'});}}});
 assert.equal(calls.length,2);assert.equal(observed.length,3);
 const action=observed[1].find(m=>m.role==='assistant'&&m.content.includes('code.search'));
 assert.ok(action);assert.deepEqual(JSON.parse(action.content),{tool:'code.search',input:{query:'renderRichText'}});
 const results=observed[2].filter(m=>m.content.startsWith('TOOL_RESULT ')).map(m=>JSON.parse(m.content.slice('TOOL_RESULT '.length)));
 assert.equal(results[0].status,'SUCCEEDED');assert.deepEqual(results[0].input,{query:'renderRichText'});
 assert.equal(results[0].result.matches[0].path,calls[1][1].path);
 assert.equal(results[1].status,'FAILED');assert.equal(results[1].error,'AUTH_REQUIRED');assert.equal(rows[1].status,'FAILED');
});

test('tool result compaction is valid JSON and explicitly reports lost context',async()=>{
 const observed=[];
 const replies=['{"tool":"code.read","input":{"path":"large.js"}}','{"final":true}'];
 await runAgentToolLoop({text:'vérifie le code',env:{AI:{async run(_model,{messages}){observed.push(messages);return {response:replies.shift()};}}},bus:{list:()=>[{id:'code.read'}],async execute(){return {content:'BEGIN '+ 'x'.repeat(10000)+' END'};}}});
 assert.equal(observed.length,2);
 const text=observed[1].find(m=>m.content.startsWith('TOOL_RESULT ')).content.slice('TOOL_RESULT '.length);
 const row=JSON.parse(text);assert.equal(row.truncated,true);assert.equal(row.status,'SUCCEEDED');assert.match(row.result_preview,/TRUNCATED/);assert.match(row.result_preview,/BEGIN/);assert.match(row.result_preview,/END/);assert.ok(text.length<4000);
});

test('a stalled planner stops at the shared deadline without executing a tool',async()=>{
 let calls=0;const started=Date.now();
 const rows=await runAgentToolLoop({text:'vérifie mon agenda',deadlineAt:Date.now()+30,env:{AI:{run(){return new Promise(()=>{});}}},bus:{list:()=>[{id:'calendar.events.read'}],async execute(){calls++;}}});
 assert.deepEqual(rows,[]);assert.equal(calls,0);assert.ok(Date.now()-started<1000);
});

test('late read recovery stops waiting at the same deadline and reports an actual failure',async()=>{
 const started=Date.now();let calls=0;
 const rows=await executeLeakedReads({text:'{"tool":"code.read","input":{"path":"large.js"}}',deadlineAt:Date.now()+30,bus:{execute(){calls++;return new Promise(()=>{});}}});
 assert.equal(calls,1);assert.equal(rows[0].status,'FAILED');assert.equal(rows[0].error,'CHAT_DEADLINE_EXCEEDED');assert.ok(Date.now()-started<1000);
 const expired=await executeLeakedReads({text:'{"tool":"code.read","input":{}}',deadlineAt:Date.now()-1,bus:{async execute(){calls++;}}});
 assert.equal(calls,1,'no read starts after the shared deadline');assert.equal(expired[0].error,'CHAT_DEADLINE_EXCEEDED');
});


test('a stalled planned read stops without retries and an expired planner starts nothing',async()=>{
 let tools=0;let models=0;
 const env={AI:{async run(){models++;return {response:'{"tool":"code.read","input":{"path":"large.js"}}'};}}};
 const localBus={list:()=>[{id:'code.read'}],execute(){tools++;return new Promise(()=>{});}};
 const rows=await runAgentToolLoop({env,bus:localBus,text:'vérifie le code',deadlineAt:Date.now()+30});
 assert.equal(rows[0].error,'CHAT_DEADLINE_EXCEEDED');assert.equal(rows[0].status,'FAILED');assert.equal(tools,1);assert.equal(models,1);
 assert.deepEqual(await runAgentToolLoop({env,bus:localBus,text:'vérifie le code',deadlineAt:Date.now()-1}),[]);
 assert.equal(tools,1);assert.equal(models,1);
});

test('tool-call wrapper tags from open-model templates never survive in the final prose',()=>{
 const raw='<tool_call>{"name":"code.read","arguments":{"path":"src/index.js"}}</tool_call>';
 assert.deepEqual(parseAgentAction(raw),{tool:'code.read',input:{path:'src/index.js'}});
 assert.equal(stripLeakedToolCalls('Avant '+raw+' Après'),'Avant  Après');
});

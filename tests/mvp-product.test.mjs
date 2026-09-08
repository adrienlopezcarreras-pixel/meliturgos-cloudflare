import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {onRequestGet} from '../src/pages/mvp-interface.js';
import {withConversationArchive} from '../src/conversations/intercept.js';
import {sqliteD1} from './helpers/sqlite-d1.mjs';
import worker from '../src/index.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 20));
async function ui(fetch, historyFetch = async () => Response.json({messages:[],conversations:[]})) {
 const html = await (await onRequestGet({})).text();
 const dom = new JSDOM(html,{url:'http://localhost',runScripts:'dangerously',beforeParse(w){w.fetch=(path,init)=>path.startsWith('/api/gen2/') ? historyFetch(path,init) : fetch(path,init);w.AbortSignal=AbortSignal;}});
 await tick();
 return dom;
}
test('MVP sends text to existing chat API, renders answer, prevents double send',async()=>{
 const calls=[];let finish;
 const dom=await ui((path,init)=>{calls.push({path,body:JSON.parse(init.body)});return new Promise(resolve=>finish=resolve);});
 const d=dom.window.document;d.querySelector('#messageInput').value='Bonjour';d.querySelector('#sendBtn').click();d.querySelector('#sendBtn').click();
 assert.equal(calls.length,1);assert.equal(calls[0].path,'/api/chat');assert.equal(calls[0].body.text,'Bonjour');assert.ok(calls[0].body.conversation_id);assert.match(d.querySelector('#chatStatus').textContent,/réfléchit/);
 finish(Response.json({text:'Bonjour Adrien'}));await tick();assert.equal(d.querySelector('.ai .content').textContent,'Bonjour Adrien');assert.equal(d.querySelector('#messageInput').value,'');dom.window.close();
});
test('MVP keeps draft on failure and renders text safely',async()=>{
 const dom=await ui(async()=>Response.json({error:'failed'},{status:503}));const d=dom.window.document;
 d.querySelector('#messageInput').value='<img src=x onerror=alert(1)>';d.querySelector('#sendBtn').click();await tick();assert.match(d.querySelector('#chatStatus').textContent,/indisponible/);assert.equal(d.querySelector('#messageInput').value,'<img src=x onerror=alert(1)>');assert.equal(d.querySelectorAll('#chatResults img').length,0);assert.equal(d.querySelector('#sendBtn').disabled,false);dom.window.close();
});
test('archive survives request consumption and stores text, device, model and attachments',async()=>{
 const DB=sqliteD1();try {
 const handler=withConversationArchive(async req=>{await req.json();return Response.json({text:'Réponse',model:'test-engine'});});
 const r=await handler(new Request('http://localhost/api/chat',{method:'POST',body:JSON.stringify({text:'Question',conversation_id:'c1',device_id:'d1',attachments:[{name:'a.txt'}]})}),{DB});
 assert.equal(r.status,200);const {results}=await DB.prepare('SELECT * FROM archive_messages ORDER BY timestamp').all();assert.equal(results.length,2);assert.equal(results[0].content,'Question');assert.equal(results[1].content,'Réponse');assert.equal(results[0].device_id,'d1');assert.equal(results[1].model,'test-engine');assert.deepEqual(JSON.parse(results[0].attachments_json),[{name:'a.txt'}]);
 }finally{DB.close();}
});
test('failed chat responses are not archived as assistant answers',async()=>{
 const DB=sqliteD1();try{const h=withConversationArchive(async req=>{await req.json();return Response.json({error:'bad'},{status:503});});await h(new Request('http://localhost/api/chat',{method:'POST',body:JSON.stringify({text:'Question'})}),{DB});assert.equal((await DB.prepare("SELECT * FROM archive_messages").all()).results.length,0);}finally{DB.close();}
});
test('real entrypoint chat integrates existing model router and archive with in-memory SQL and mocked AI',async()=>{
 const DB=sqliteD1();const calls=[];const env={DB,MELITURGOS_USER:'test',MELITURGOS_PASSWORD:'test-only',AI:{async run(model,input){calls.push({model,input});return {response:'Réponse du moteur de test'};}}};
 try{const r=await worker.fetch(new Request('http://localhost/api/chat',{method:'POST',headers:{authorization:'Basic '+btoa('test:test-only'),'content-type':'application/json'},body:JSON.stringify({text:'Bonjour',conversation_id:'integration',device_id:'browser'})}),env);
 const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));assert.equal(data.text,'Réponse du moteur de test');assert.equal(calls.length,1);assert.equal((await DB.prepare('SELECT * FROM archive_messages').all()).results.length,2);
 }finally{DB.close();}
});

test('conversation context is scoped and cognitive memory is passed to the interchangeable engine',async()=>{
 const DB=sqliteD1();const calls=[];const env={DB,MELITURGOS_USER:'test',MELITURGOS_PASSWORD:'test-only',AI:{async run(model,input){calls.push(input.messages);return {response:'Réponse de test'};}}};
 const request=(text,conversation_id)=>new Request('http://localhost/api/chat',{method:'POST',headers:{authorization:'Basic '+btoa('test:test-only'),'content-type':'application/json'},body:JSON.stringify({text,conversation_id})});
 try {
  assert.equal((await worker.fetch(request('Souviens-toi que mon projet est le jardin solaire','garden'),env)).status,200);
  assert.equal((await worker.fetch(request('Autre sujet confidentiel pour cette conversation','other'),env)).status,200);
  const r=await worker.fetch(request('Quel est mon projet jardin solaire ?','garden'),env);assert.equal(r.status,200);
  const messages=calls.at(-1);assert.ok(messages.some(m=>m.role==='user'&&m.content.includes('Souviens-toi')));
  assert.ok(!messages.some(m=>m.role==='user'&&m.content.includes('Autre sujet')));
  assert.match(messages[0].content,/jardin solaire/);
  assert.equal((await DB.prepare('SELECT * FROM memories').all()).results.length,1);
  assert.equal((await DB.prepare("SELECT * FROM archive_messages WHERE conversation_id='garden'").all()).results.length,4);
  const list=await worker.fetch(new Request('http://localhost/api/gen2/conversations',{headers:{authorization:'Basic '+btoa('test:test-only')}}),env);
  assert.equal((await list.json()).conversations.length,2);
 } finally { DB.close(); }
});

test('MVP restores history, switches conversations and creates a fresh conversation',async()=>{
 const paths=[];
 const dom=await ui(async()=>Response.json({text:'ok'}),async path=>{
  paths.push(path);
  return Response.json(path.includes('/messages?') ? {messages:[{role:'user',content:'Message sauvegardé'},{role:'assistant',content:'Réponse sauvegardée'}]} : {conversations:[{id:'other-device',title:'Depuis le téléphone'}]});
 });
 const d=dom.window.document;assert.match(d.querySelector('#chatResults').textContent,/Réponse sauvegardée/);
 const select=d.querySelector('#conversationSelect');select.value='other-device';select.dispatchEvent(new dom.window.Event('change'));await tick();
 assert.ok(paths.some(p=>p.endsWith('conversation_id=other-device')));assert.equal(dom.window.localStorage.getItem('mel.conversation'),'other-device');
 d.querySelector('#newConversation').click();await tick();assert.equal(d.querySelector('#chatResults').textContent,'');assert.notEqual(dom.window.localStorage.getItem('mel.conversation'),'other-device');dom.window.close();
});

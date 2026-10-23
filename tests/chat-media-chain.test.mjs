import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
const fullPage=await readFile(new URL('../src/pages/full-interface-v2.js',import.meta.url),'utf8');
const addMsgSource=fullPage.match(/^function addMsg\([^\n]+/m)[0];
import worker from '../src/index.js';
import {CHAT_RICH_RENDERER_SOURCE} from '../src/pages/chat-rich-renderer.js';
import {collectChatMedia} from '../src/api/chat-media.js';
import {normalizeImageResults} from '../src/search/image-search.js';

function browser(t,text,metadata={}){
 const dom=new JSDOM('<div id="host"></div>',{url:'https://mel.example/',runScripts:'outside-only'});t.after(()=>dom.window.close());
 dom.window.eval(CHAT_RICH_RENDERER_SOURCE);dom.window.qs=selector=>dom.window.document.querySelector(selector);dom.window.eval(addMsgSource);const host=dom.window.document.getElementById('host');
 assert.equal(dom.window.melRenderRichText(host,text,metadata),true);return {dom,host};
}
function env(fetcher){return {MELITURGOS_USER:'test',MELITURGOS_PASSWORD:'test-only',MEL_WEB_MIN_INTERVAL_MS:0,MEL_WEB_FETCH:fetcher,AI:{async run(){return {response:JSON.stringify({capability:'web.research',args:{query:'photo du pape François',max_results:5,pages:1}})};}}};}
function request(text,mode='conversation',stream=false){return new Request('https://mel.example/api/chat',{method:'POST',headers:{authorization:'Basic '+btoa('test:test-only'),'content-type':'application/json'},body:JSON.stringify({text,stream,conversation_id:'media-'+mode,intent_context:{surface:'mel-full',requested_mode:mode,role:mode==='code'?'developer':'assistant'}})});}
for(const mode of ['conversation','code'])test('real sourced photos reach browser without raw tool JSON, mode='+mode,async t=>{
 let calls=0;
 const response=await worker.fetch(request('Montre-moi trois photos de chats',mode),env(async url=>{
  calls++;assert.equal(new URL(url).hostname,'commons.wikimedia.org');
  return Response.json({query:{pages:Object.fromEntries([1,2,3].map(n=>[n,{index:n,title:'Chat '+n,imageinfo:[{thumburl:'https://upload.wikimedia.org/chat'+n+'.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Chat'+n,mime:'image/jpeg'}]}]))}});
 }));
 const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));assert.equal(calls,1);
 assert.equal(data.media.length,3);assert.equal(data.references.length,3);assert.doesNotMatch(data.text,/"capability"|François/);
 const {host}=browser(t,data.text,data);assert.equal(host.querySelectorAll('img').length,3);
 assert.equal(new Set([...host.querySelectorAll('img')].map(img=>img.src)).size,3);
 assert.equal(host.querySelectorAll('a').length,3);
 // Restored history consumes the identical persisted Markdown+metadata contract.
 const restored=browser(t,data.text,JSON.stringify({media:data.media,references:data.references}));
 assert.equal(restored.host.querySelectorAll('img').length,3);
});
for(const kind of ['empty','timeout'])test('provider '+kind+' yields an explicit failure or empty result, not fictional images',async t=>{
 const response=await worker.fetch(request('Montre moi une image de chat'),env(async()=>{if(kind==='timeout')throw new Error('upstream timeout');return Response.json({query:{pages:{}}});}));
 const data=await response.json();assert.equal(data.media.length,0);assert.match(data.text,kind==='empty'?/IMAGE_SEARCH_EMPTY/:/IMAGE_PROVIDER_TIMEOUT/);
 const {host}=browser(t,data.text,data);assert.equal(host.querySelectorAll('img').length,0);
});
test('one shared renderer handles typed image, video, audio and protected documents without URL extensions',t=>{
 const result=collectChatMedia([{capability:'authorized.files.read',status:'SUCCEEDED',result:{media:[
  {type:'image',url:'https://cdn.example/media/a',mime:'image/png'},
  {type:'video',url:'https://cdn.example/media/b',mime:'video/mp4'},
  {type:'audio',url:'https://cdn.example/media/c',mime:'audio/mpeg'},
  {type:'document',url:'/api/files/private-document',mime:'application/pdf',title:'Mon document'},
 ]}}],'https://mel.example');
 const {host,dom}=browser(t,'Médias obtenus.',result);
 assert.equal(host.querySelectorAll('img').length,1);assert.equal(host.querySelectorAll('video').length,1);assert.equal(host.querySelectorAll('audio').length,1);
 assert.equal(host.querySelector('a').href,'https://mel.example/api/files/private-document');
 assert.equal(host.querySelectorAll('iframe').length,0);
 host.querySelector('video').dispatchEvent(new dom.window.Event('error'));
 assert.match(host.textContent,/Média indisponible/);
 dom.window.melRenderRichText(host,'Médias obtenus.',result);
 assert.equal(host.querySelectorAll('video').length,1,'re-render/resume replaces media without duplicating it');
});
test('malicious or private-network external media never become browser embeds',t=>{
 const raw=['javascript:alert(1)','data:image/svg+xml,bad','https://user:password@evil.example/x.jpg','https://127.0.0.1/x.jpg','https://10.0.0.1/x.mp4','https://evil.example/x.svg'];
 assert.equal(normalizeImageResults(raw.map(url=>({url,source_url:'https://example.org/source'}))).length,0);
 const {host,dom}=browser(t,'<script>window.pwned=1</script>',{media:raw.map(url=>({type:'image',url})),references:[{url:'javascript:alert(1)',title:'bad'}]});
 assert.equal(host.querySelectorAll('img,iframe,script,video,audio').length,0);assert.equal(dom.window.pwned,undefined);
});

test('the real server stream preserves media and references through browser completion and D1 restore',async t=>{
 const {sqliteD1}=await import('./helpers/sqlite-d1.mjs');
 const {ConversationService}=await import('../src/conversations/conversation-service.js');
 const {MEL_CHAT_STREAM_SOURCE}=await import('../src/pages/mel-chat-stream.js');
 const DB=sqliteD1();t.after(()=>DB.close());
 const environment={...env(async()=>Response.json({query:{pages:{1:{title:'Chat',imageinfo:[{url:'https://upload.wikimedia.org/chat.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Chat',mime:'image/jpeg'}]}}}})),DB};
 const response=await worker.fetch(request('Montre moi une photo de chat','conversation',true),environment);
 assert.match(response.headers.get('content-type'),/ndjson/);
 const {dom,host}=browser(t,'');host.id='chatlog';
 dom.window.fetch=async()=>response;
 dom.window.TextDecoder=TextDecoder;
 dom.window.AbortSignal=AbortSignal;
 dom.window.eval(MEL_CHAT_STREAM_SOURCE);
 const result=await dom.window.melChatFetch({text:'Montre moi une photo de chat'});
 assert.equal(result.media.length,1);assert.equal(result.references.length,1);
 assert.equal(host.querySelectorAll('img').length,1);
 const messages=await new ConversationService(DB).getMessages('media-conversation');
 const saved=messages.find(row=>row.role==='assistant');assert.ok(saved);
 assert.equal(saved.metadata.media.length,1);
 const restored=browser(t,saved.content,saved.metadata);assert.equal(restored.host.querySelectorAll('img').length,1);
});

test('a final event without newline retains video metadata, and interrupted partial media stays visible',async t=>{
 const {MEL_CHAT_STREAM_SOURCE}=await import('../src/pages/mel-chat-stream.js');
 const {dom,host}=browser(t,'');host.id='chatlog';dom.window.TextDecoder=TextDecoder;
 dom.window.eval(MEL_CHAT_STREAM_SOURCE);
 const media=[{type:'video',url:'https://example.org/clip',mime:'video/mp4'}];
 const bytes=new TextEncoder().encode(JSON.stringify({type:'delta',text:'Voici la vidéo.'})+'\n'+JSON.stringify({type:'done',result:{ok:true,media}}));
 dom.window.fetch=async()=>new Response(bytes,{headers:{'content-type':'application/x-ndjson'}});
 const result=await dom.window.melChatFetch({text:'vidéo'});
 assert.equal(result.media.length,1);assert.equal(host.querySelectorAll('video').length,1);
 host.replaceChildren();
 dom.window.fetch=async()=>new Response(JSON.stringify({type:'delta',text:'![Photo](https://example.org/photo.jpg)'})+'\n'+JSON.stringify({type:'error',code:'PROVIDER_INTERRUPTED'})+'\n',{headers:{'content-type':'application/x-ndjson'}});
 const partial=await dom.window.melChatFetch({text:'photo'});
 assert.equal(partial.ok,false);assert.equal(host.querySelectorAll('img').length,1);assert.match(host.textContent,/interrompue/);
});

test('ordinary research remains text with real references instead of image routing',async t=>{
 const environment=env(async()=>new Response('<html><head><title>Rome</title></head><body>Rome est la capitale italienne.</body></html>',{headers:{'content-type':'text/html'}}));
 environment.AI.run=async()=>({response:'Rome est la capitale de l’Italie. Les sources consultées sont jointes.'});
 const response=await worker.fetch(request('Recherche des informations sur Rome'),environment);
 const data=await response.json();assert.equal(response.status,200);assert.match(data.text,/Rome/);assert.equal(data.media.length,0);assert.ok(data.references.length>0);
 const {host}=browser(t,data.text,data);assert.equal(host.querySelectorAll('img,video,audio').length,0);assert.ok(host.querySelectorAll('a').length>0);
});

test('an ordinary Code-mode question does not expose the model tool protocol',async t=>{
 const response=await worker.fetch(request('Montre moi une photo de chat','code'),env(async()=>Response.json({query:{pages:{1:{title:'Chat',imageinfo:[{url:'https://upload.wikimedia.org/cat.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Cat',mime:'image/jpeg'}]}}}})));
 const data=await response.json();assert.doesNotMatch(data.text,/capability|args|web\.research/);assert.equal(data.media.length,1);
 const {host}=browser(t,data.text,data);assert.equal(host.querySelectorAll('img').length,1);assert.equal(host.querySelectorAll('pre').length,0);
});

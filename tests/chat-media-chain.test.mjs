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
function env(fetcher){return {MELITURGOS_USER:'test',MELITURGOS_PASSWORD:'test-only',MEL_WEB_MIN_INTERVAL_MS:0,MEL_WEB_FETCH:(url,...args)=>new URL(url).hostname==='fr.wikipedia.org'?Promise.resolve(Response.json({query:{pages:{missing:{missing:''}}}})):fetcher(url,...args),AI:{async run(){return {response:JSON.stringify({capability:'web.research',args:{query:'photo du pape François',max_results:5,pages:1}})};}}};}
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
 const data=await response.json();assert.equal(response.status,200);assert.match(data.text,/Rome/);assert.equal(data.media.length,0);assert.ok(data.references.length>0,JSON.stringify(data.tool_results));
 const {host}=browser(t,data.text,data);assert.equal(host.querySelectorAll('img,video,audio').length,0);assert.ok(host.querySelectorAll('a').length>0);
});

test('an ordinary Code-mode question does not expose the model tool protocol',async t=>{
 const response=await worker.fetch(request('Montre moi une photo de chat','code'),env(async()=>Response.json({query:{pages:{1:{title:'Chat',imageinfo:[{url:'https://upload.wikimedia.org/cat.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Cat',mime:'image/jpeg'}]}}}})));
 const data=await response.json();assert.doesNotMatch(data.text,/capability|args|web\.research/);assert.equal(data.media.length,1);
 const {host}=browser(t,data.text,data);assert.equal(host.querySelectorAll('img').length,1);assert.equal(host.querySelectorAll('pre').length,0);
});

test('accepted asynchronous work never becomes a completed media result',()=>{
 const media=[{type:'video',url:'https://example.org/accepted-video',mime:'video/mp4'}];
 for(const status of ['QUEUED','ACCEPTED','PENDING','RUNNING','PROCESSING']) {
  assert.deepEqual(collectChatMedia([{capability:'media.video.generate',status:'SUCCEEDED',result:{status,media}}]),{media:[],references:[]});
 }
 assert.equal(collectChatMedia([{capability:'media.video.generate',status:'FAILED',result:{media}}]).media.length,0);
 assert.equal(collectChatMedia([{capability:'media.video.generate',status:'SUCCEEDED',result:{status:'COMPLETED',media}}]).media.length,1);
});

test('a photo request with an explanation preserves prose and only retrieved media URLs',async t=>{
 const environment=env(async()=>Response.json({query:{pages:{1:{title:'Chat',imageinfo:[{url:'https://upload.wikimedia.org/real-cat.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:RealCat',mime:'image/jpeg'}]}}}}));
 environment.AI.run=async()=>({response:'Les chats ronronnent dans plusieurs situations ; le contexte compte.\n\n![Photo inventée](https://example.org/invented.jpg)'});
 const data=await (await worker.fetch(request('Montre moi une photo de chat et explique pourquoi les chats ronronnent'),environment)).json();
 assert.match(data.text,/Les chats ronronnent/);assert.doesNotMatch(data.text,/invented\.jpg/);assert.equal(data.media.length,1);
 const {host}=browser(t,data.text,data);assert.equal(host.querySelectorAll('img').length,1);assert.equal(host.querySelector('img').src,'https://upload.wikimedia.org/real-cat.jpg');
});

for(const text of ['Tu peux me montrer une photo de Rome ?', 'Je voudrais une photo de Rome, s’il te plaît'])test('conversational request executes search with its subject: '+text,async t=>{
 let calls=0;
 const response=await worker.fetch(request(text),env(async url=>{
  calls++;assert.equal(new URL(url).searchParams.get('gsrsearch'),'Rome filetype:bitmap');
  return Response.json({query:{pages:{1:{title:'Rome',imageinfo:[{url:'https://upload.wikimedia.org/rome.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Rome',mime:'image/jpeg'}]}}}});
 }));
 const result=await response.json();assert.equal(response.status,200);assert.equal(calls,1);assert.equal(result.media.length,1);
 const {host}=browser(t,result.text,result);assert.equal(host.querySelectorAll('img').length,1);
 assert.doesNotMatch(result.text,/"capability"|"args"/);
});

for(const mode of ['conversation','code'])for(const type of ['image','audio','video'])test('verified '+type+' survives total inference failure, mode='+mode,async t=>{
 const {sqliteD1}=await import('./helpers/sqlite-d1.mjs');const DB=sqliteD1();t.after(()=>DB.close());
 const mime={image:'image/jpeg',audio:'audio/ogg',video:'video/webm'}[type];
 const environment={...env(async()=>Response.json({query:{pages:{1:{title:'Média récupéré',imageinfo:[{url:'https://upload.wikimedia.org/recovered.'+({image:'jpg',audio:'ogg',video:'webm'}[type]),descriptionurl:'https://commons.wikimedia.org/wiki/File:Recovered',mime}]}}}})),DB,
  AI:{async run(){throw Object.assign(Error('PRIVATE_PROVIDER_BODY'),{code:'AI_PROVIDER_UNAVAILABLE'});}}};
 const prompt={image:'Montre-moi une photo de chat',audio:'Fais-moi écouter un son de pluie',video:'Montre-moi une vidéo de mer'}[type];
 const response=await worker.fetch(request(prompt,mode),environment);const data=await response.json();
 assert.equal(response.status,200,JSON.stringify(data));assert.equal(data.analysis_available,false);assert.equal(data.analysis_error,'CHAT_INFERENCE_FAILED');
 assert.equal(data.media.length,1);assert.equal(data.media[0].type,type);
 if(type==='image'){
  assert.match(data.text,/Voici une photo correspondant à ta demande\./);
  assert.doesNotMatch(data.text,/synthèse.*indisponible|Média récupéré|PRIVATE_PROVIDER_BODY/i);
 } else assert.match(data.text,/synthèse.*indisponible/i);
 assert.doesNotMatch(data.text,/PRIVATE_PROVIDER_BODY/);
 const {host}=browser(t,data.text,data);assert.equal(host.querySelectorAll(type==='image'?'img':type).length,1);
 const {ConversationService}=await import('../src/conversations/conversation-service.js');
 const saved=(await new ConversationService(DB).getMessages('media-'+mode)).find(row=>row.role==='assistant');
 assert.ok(saved);assert.equal(saved.metadata.media[0].type,type);assert.equal(saved.metadata.analysis_available,false);
});

for(const result of [
 {ok:true,status:'QUEUED',media:[{type:'video',url:'https://cdn.example/not-ready.webm',mime:'video/webm'}]},
 {ok:true,media:[{type:'video',url:'https://127.0.0.1/private.webm',mime:'video/webm'}]},
])test('inference failure cannot promote pending or unsafe media to completed output',async()=>{
 const environment={MELITURGOS_USER:'test',MELITURGOS_PASSWORD:'test-only',AI:{async run(){throw Object.assign(Error('provider unavailable'),{code:'AI_PROVIDER_UNAVAILABLE'});}},MEL_MEDIA_CAPABILITIES:{'media.video.generate':async()=>result}};
 const response=await worker.fetch(request('Génère une vidéo de mer'),environment);const data=await response.json();
 assert.equal(response.status,503);assert.equal(data.code,'CHAT_INFERENCE_FAILED');assert.ok(!data.media?.length);
});


test('Code mode displays the current pope photo even when the Vatican historical table is truncated',async t=>{
  const calls=[];
  const environment={
    MELITURGOS_USER:'test',MELITURGOS_PASSWORD:'test-only',MEL_WEB_MIN_INTERVAL_MS:0,
    MEL_WEB_FETCH:async url=>{
      const raw=String(url);calls.push(raw);
      if(raw==='https://www.vatican.va/content/vatican/fr/holy-father.html')
        return new Response('<html><head><title>Pontifes</title></head><body><table><tr><td>266</td><td>François</td><td>21.IV.2025</td></tr></table></body></html>',{headers:{'content-type':'text/html'}});
      if(raw==='https://www.vatican.va/holy_father/index_fr.htm')
        return new Response('<html><a href="/leo">Léon XIV</a><a href="/francois">François</a><a href="/benoit">Benoît XVI</a></html>',{headers:{'content-type':'text/html'}});
      if(raw.startsWith('https://fr.wikipedia.org/'))return Response.json({query:{pages:{'-1':{missing:''}}}});
      if(raw.startsWith('https://commons.wikimedia.org/'))return Response.json({query:{pages:{
        1:{index:1,title:'File:Pope Leo XIV portrait.jpg',imageinfo:[{
          thumburl:'https://upload.wikimedia.org/leo14.jpg',
          descriptionurl:'https://commons.wikimedia.org/wiki/File:Pope_Leo_XIV_portrait.jpg',
          mime:'image/jpeg',
        }]},
      }}});
      throw Error('Unexpected fetch '+raw);
    },
    AI:{async run(){return {response:'Photo trouvée.'};}},
  };
  const response=await worker.fetch(request('montre moi une photo du pape','code'),environment);
  const data=await response.json();
  assert.equal(response.status,200,JSON.stringify(data));
  assert.doesNotMatch(data.text,/IMAGE_SEARCH_EMPTY/);
  assert.equal(data.media.length,1,JSON.stringify(data));
  assert.equal(data.media[0].url,'https://upload.wikimedia.org/leo14.jpg');
  assert.match(data.text,/Voici une photo du pape Léon XIV\./);
  assert.doesNotMatch(data.text,/File:Pope|synthèse du modèle est indisponible/i);
  assert.ok(calls.includes('https://www.vatican.va/holy_father/index_fr.htm'));
  const {host}=browser(t,data.text,data);
  assert.equal(host.querySelectorAll('img').length,1);
});

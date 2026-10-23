import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import worker from '../src/index.js';
import {inferChatMediaCapability} from '../src/api/chat-media-intent.js';
import {CHAT_RICH_RENDERER_SOURCE} from '../src/pages/chat-rich-renderer.js';
import {storePrivateArtifact} from '../src/media/workers-ai-media-capabilities.js';

function fixture(){
 const objects=new Map();let reads=0;
 const env={MELITURGOS_USER:'owner',MELITURGOS_PASSWORD:'test-only',MEL_WEB_MIN_INTERVAL_MS:0,
  MEL_MEDIA_ENCRYPTION_KEY_ID:'fixture',MEL_MEDIA_ENCRYPTION_KEY_B64:Buffer.alloc(32,17).toString('base64'),
  MEDIA_BUCKET:{async put(key,bytes,options){objects.set(key,{bytes,customMetadata:options.customMetadata});},async get(key){reads++;const o=objects.get(key);return o?{customMetadata:o.customMetadata,arrayBuffer:async()=>o.bytes.buffer.slice(o.bytes.byteOffset,o.bytes.byteOffset+o.bytes.byteLength)}:null;}},
  AI:{async run(){return {response:'Le résultat obtenu est joint ci-dessous, avec sa source lorsqu’il provient du web.'};}},
 };
 return {env,objects,reads:()=>reads};
}
function req(path,body,authenticated=true){return new Request('https://mel.example'+path,{method:body?'POST':'GET',headers:{...(authenticated?{authorization:'Basic '+btoa('owner:test-only')} : {}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}
function render(t,data){const dom=new JSDOM('<div id="out"></div>',{url:'https://mel.example',runScripts:'outside-only'});t.after(()=>dom.window.close());dom.window.eval(CHAT_RICH_RENDERER_SOURCE);const root=dom.window.document.querySelector('#out');dom.window.melRenderRichText(root,data.text,data);return root;}

test('media intent separates search, generation, speech and explanation',()=>{
 for(const [text,id] of [['Montre moi une vidéo de chats','web.media.search'],['Fais-moi écouter un son de pluie','web.media.search'],['Génère une musique douce','media.music.generate'],['Crée une image de chat','media.image.generate'],['Génère une vidéo de mer','media.video.generate'],['Lis à voix haute : Bonjour Adrien','media.audio.synthesize']])assert.equal(inferChatMediaCapability(text)?.id,id,text);
 for(const text of ['Pourquoi tu ne montres pas de vidéo ?','Analyse ma vidéo ci-jointe','Donne un exemple JSON de génération audio','Résume https://example.org/video.mp4','Bonjour'])assert.equal(inferChatMediaCapability(text),null,text);
});
for(const type of ['audio','video'])test('real worker '+type+' search yields a sourced browser player without paid APIs',async t=>{
 const f=fixture();let calls=0;
 f.env.MEL_WEB_FETCH=async url=>{calls++;assert.equal(new URL(url).hostname,'commons.wikimedia.org');assert.match(new URL(url).searchParams.get('gsrsearch'),new RegExp('filetype:'+type));return Response.json({query:{pages:{1:{title:'Extrait libre',imageinfo:[{url:'https://upload.wikimedia.org/extrait.'+(type==='audio'?'ogg':'webm'),mime:type+'/'+(type==='audio'?'ogg':'webm'),descriptionurl:'https://commons.wikimedia.org/wiki/File:Extrait',extmetadata:{Artist:{value:'<b>Artiste</b>'}}}]}}}});};
 const response=await worker.fetch(req('/api/chat',{text:type==='audio'?'Fais-moi écouter un son de pluie':'Montre moi une vidéo de mer'}),f.env);
 const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));assert.equal(calls,1);assert.equal(data.media.length,1,JSON.stringify(data.tool_results));assert.equal(data.media[0].type,type);assert.equal(data.references.length,1);assert.equal(data.tool_results[0].result.zero_added_cost,true);
 const root=render(t,data);assert.equal(root.querySelectorAll(type).length,1);assert.match(root.textContent,/Artiste/);assert.equal(root.querySelector(type).hasAttribute('autoplay'),false);
});
test('actual procedural generation is encrypted and retrievable only through owner-authenticated playback',async t=>{
 const f=fixture();
 const response=await worker.fetch(req('/api/chat',{text:'Génère un son de notification'}),f.env);const data=await response.json();
 assert.equal(response.status,200,JSON.stringify(data));assert.equal(data.media.length,1,JSON.stringify(data.tool_results));assert.equal(data.media[0].type,'audio');assert.match(data.text,/procédurale/);assert.equal(f.objects.size,1);
 const root=render(t,data);assert.equal(root.querySelectorAll('audio').length,1);
 const path=new URL(data.media[0].url).pathname+new URL(data.media[0].url).search;
 const before=f.reads();assert.equal((await worker.fetch(req(path,null,false),f.env)).status,401);assert.equal(f.reads(),before,'unauthenticated request must not read the bucket');
 const played=await worker.fetch(req(path),f.env);assert.equal(played.status,200);assert.equal(played.headers.get('content-type'),'audio/wav');assert.match(played.headers.get('cache-control'),/no-store/);
 const bytes=new Uint8Array(await played.arrayBuffer());assert.equal(new TextDecoder().decode(bytes.slice(0,4)),'RIFF');assert.ok(bytes.length>40000);
 const [key,stored]=[...f.objects][0];assert.notEqual(new TextDecoder().decode(stored.bytes.slice(0,4)),'RIFF');
 stored.customMetadata.owner='other';assert.equal((await worker.fetch(req(path),f.env)).status,404);
 stored.customMetadata.owner='owner';stored.customMetadata.expiresAt='2000-01-01T00:00:00Z';assert.equal((await worker.fetch(req(path),f.env)).status,410);
 assert.ok(key.startsWith('generated/'));
});
test('private generated media rejects arbitrary keys and active content',async()=>{
 const f=fixture();assert.equal((await worker.fetch(req('/api/media/generated?key=other%2Fprivate'),f.env)).status,400);
 const artifact=await storePrivateArtifact(f.env,new TextEncoder().encode('<script>alert(1)</script>'),{capability:'test',model:'fixture',mime:'text/html',extension:'html'});
 assert.equal((await worker.fetch(req('/api/media/generated?key='+encodeURIComponent(artifact.key)),f.env)).status,415);
});
test('an unavailable free video generator remains a failure, never a completed video',async()=>{
 const f=fixture();const data=await (await worker.fetch(req('/api/chat',{text:'Génère une vidéo de mer'}),f.env)).json();
 assert.equal(data.media.length,0);assert.ok(data.tool_results.some(row=>row.capability==='media.video.generate'&&row.status==='FAILED'));assert.match(data.text,/CAPABILITY_UNAVAILABLE|MEDIA_/);assert.equal(f.objects.size,0);
});
for(const kind of ['empty','timeout'])test('audio/video '+kind+' never invents playable media',async()=>{
 const f=fixture();f.env.MEL_WEB_FETCH=async()=>{if(kind==='timeout')throw new Error('upstream timeout');return Response.json({query:{pages:{}}});};
 const data=await (await worker.fetch(req('/api/chat',{text:'Montre moi une vidéo de mer'}),f.env)).json();assert.equal(data.media.length,0);assert.match(data.text,kind==='empty'?/Aucun son ou vidéo/:/MEDIA_PROVIDER_TIMEOUT/);
});

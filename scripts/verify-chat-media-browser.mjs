// Local, zero-provider-cost browser proof. Real DSP audio and encrypted private
// playback; image/video generation adapters are explicit local fixtures. This
// does not certify any production provider, quota or deployed Worker.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import worker from '../src/index.js';
import {storePrivateArtifact} from '../src/media/workers-ai-media-capabilities.js';
import {CHAT_RICH_RENDERER_SOURCE} from '../src/pages/chat-rich-renderer.js';

const directory=await mkdtemp(join(tmpdir(),'mel-browser-media-'));
const objects=new Map(),ranges=[];
const credential='Basic '+btoa('local-owner:local-fixture-password');
const env={MELITURGOS_USER:'local-owner',MELITURGOS_PASSWORD:'local-fixture-password',
 MEL_MEDIA_ENCRYPTION_KEY_ID:'local-fixture',MEL_MEDIA_ENCRYPTION_KEY_B64:Buffer.alloc(32,29).toString('base64'),
 MEDIA_BUCKET:{async put(key,bytes,options){objects.set(key,{bytes,customMetadata:options.customMetadata});},async get(key){const object=objects.get(key);return object?{customMetadata:object.customMetadata,arrayBuffer:async()=>object.bytes.buffer.slice(object.bytes.byteOffset,object.bytes.byteOffset+object.bytes.byteLength)}:null;}},
 AI:{async run(){return {response:'Le média est prêt pour le lecteur.'};}},
};
let browser,server;
try{
 const videoBytes=await readFile(new URL('../tests/fixtures/media/blue-vp8.webm',import.meta.url));
 const video=await storePrivateArtifact(env,new Uint8Array(videoBytes),{capability:'media.video.generate',model:'local-ffmpeg-fixture',mime:'video/webm',extension:'webm'});
 const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=','base64'));
 const image=await storePrivateArtifact(env,png,{capability:'media.image.generate',model:'local-png-fixture',mime:'image/png',extension:'png'});
 env.MEL_MEDIA_CAPABILITIES={
  'media.video.generate':async()=>({ok:true,zero_added_cost:true,provider:'local-fixture',artifact:video}),
  'media.image.generate':async()=>({ok:true,zero_added_cost:true,provider:'local-fixture',artifact:image}),
 };
 const html='<!doctype html><meta charset="utf-8"><title>MEL local media proof</title><h1>MEL — local media proof</h1><p>Actual DSP audio; image/video provider fixtures. Not production.</p><div id="out"></div><button id="play">Lire les médias</button><script>'+CHAT_RICH_RENDERER_SOURCE+'</script><script>'+`
 (async()=>{
   const media=[];const kinds=[];
   for(const text of ['Crée une image de test','Génère un son de notification','Génère une vidéo de test']){
     const r=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json','authorization':${JSON.stringify(credential)}},body:JSON.stringify({text})});
     const d=await r.json();if(!r.ok||d.media?.length!==1)throw new Error('CHAT_MEDIA_RESULT_MISSING:'+JSON.stringify({status:r.status,code:d.code,mode:d.response_mode,tools:d.tool_results,text:d.text,media:d.media}));media.push(...d.media);kinds.push(d.media[0].type);
   }
   // Establish HTTP Basic authentication for native media element requests.
   await fetch(media[0].url,{headers:{authorization:${JSON.stringify(credential)}}});
   melRenderRichText(document.querySelector('#out'),'Trois résultats du vrai Worker local.',{media});
   document.querySelector('#play').onclick=async()=>{
     try{
       const audio=document.querySelector('audio'),video=document.querySelector('video');
       await audio.play();await video.play();
       await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('SEEK_TIMEOUT')),5000);video.addEventListener('seeked',()=>{clearTimeout(timeout);resolve()},{once:true});video.currentTime=0.75;});
       await new Promise(resolve=>setTimeout(resolve,350));
       const img=document.querySelector('img');window.__mediaProof={ok:img.complete&&img.naturalWidth>0&&audio.currentTime>0&&video.currentTime>=0.75,image_width:img.naturalWidth,audio_time:audio.currentTime,video_time:video.currentTime,audio_ready:audio.readyState,video_ready:video.readyState,kinds};
       audio.pause();video.pause();
     }catch(error){window.__mediaProof={ok:false,error:error.message}}
   };
   window.__mediaReady=true;
 })().catch(error=>window.__mediaProof={ok:false,error:error.message});
 `+'</script>';
 server=createServer(async(incoming,outgoing)=>{
  try{
   if(incoming.url==='/proof'){outgoing.writeHead(200,{'content-type':'text/html; charset=utf-8'});outgoing.end(html);return;}
   const chunks=[];for await(const chunk of incoming)chunks.push(chunk);
   const body=Buffer.concat(chunks),headers=new Headers(incoming.headers);
   // Native media elements receive the same browser-scoped test identity;
   // unauthorized behavior is separately tested against the real Worker.
   // Challenge/response is served below rather than injecting server auth.
   const request=new Request('http://127.0.0.1:'+server.address().port+incoming.url,{method:incoming.method,headers,...(body.length?{body}: {})});
   const response=await worker.fetch(request,env,{waitUntil(p){p.catch(()=>{});}});
   if(incoming.headers.range)ranges.push({range:incoming.headers.range,status:response.status});
   outgoing.writeHead(response.status,Object.fromEntries(response.headers));outgoing.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){outgoing.writeHead(500);outgoing.end('LOCAL_PROOF_SERVER_FAILED');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 // Basic auth is cached by Chromium after credentials are supplied to the
 // challenge through CDP Fetch.authRequired, without embedding them in URLs.
 browser=spawn(process.env.MEL_TEST_BROWSER_PATH||'chromium',['--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+join(directory,'profile'),'about:blank'],{stdio:['ignore','ignore','pipe']});
 const endpoint=await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(new Error('CHROMIUM_START_TIMEOUT')),15000);
  browser.once('error',error=>{clearTimeout(timeout);reject(error)});
  browser.once('exit',()=>{clearTimeout(timeout);reject(new Error('CHROMIUM_EXITED'))});
  browser.stderr.on('data',data=>{const match=String(data).match(/DevTools listening on (ws:\/\/\S+)/);if(match){clearTimeout(timeout);resolve(match[1]);}});
 });
 const debugOrigin='http://'+new URL(endpoint).host;
 const pages=await (await fetch(debugOrigin+'/json/list')).json();
 const ws=new WebSocket(pages.find(page=>page.type==='page').webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 let serial=0;const pending=new Map();
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('CDP_TIMEOUT:'+method))},15000);pending.set(id,{resolve:value=>{clearTimeout(timeout);resolve(value)},reject:error=>{clearTimeout(timeout);reject(error)}});ws.send(JSON.stringify({id,method,params}));});
 ws.addEventListener('message',event=>{
  const message=JSON.parse(event.data);const promise=pending.get(message.id);
  if(promise){pending.delete(message.id);message.error?promise.reject(new Error(message.error.message)):promise.resolve(message.result);}
  else if(message.method==='Fetch.authRequired')send('Fetch.continueWithAuth',{requestId:message.params.requestId,authChallengeResponse:{response:'ProvideCredentials',username:'local-owner',password:'local-fixture-password'}}).catch(()=>{});
  else if(message.method==='Fetch.requestPaused')send('Fetch.continueRequest',{requestId:message.params.requestId}).catch(()=>{});
 });
 await send('Fetch.enable',{handleAuthRequests:true});
 await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/proof'});
 const evaluate=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true})).result.value;
 const until=async expression=>{const started=Date.now();while(Date.now()-started<15000){const result=await evaluate(expression);if(result)return result;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('BROWSER_PROOF_TIMEOUT');};
 await until('window.__mediaReady || window.__mediaProof');
 if(await evaluate('!!window.__mediaProof'))throw new Error(JSON.stringify(await evaluate('window.__mediaProof')));
 await send('Runtime.evaluate',{expression:"document.querySelector('#play').click()",userGesture:true});
 const proof=await until('window.__mediaProof');
 assert.equal(proof.ok,true,JSON.stringify(proof));assert.deepEqual(proof.kinds,['image','audio','video']);
 assert.ok(ranges.some(row=>row.status===206),'Chromium must receive an authenticated byte range');
 const screenshot=process.env.MEL_TEST_SCREENSHOT_PATH;
 if(screenshot){const capture=await send('Page.captureScreenshot',{format:'png'});await writeFile(screenshot,Buffer.from(capture.data,'base64'));}
 console.log(JSON.stringify({schema:'mel.local-browser-media-proof/v1',browser:'Chromium',production:false,provider_fixtures:['image','video'],real_dsp_audio:true,proof,range_responses:ranges},null,2));
 ws.close();
} finally {
 if(browser&&!browser.killed){browser.kill('SIGTERM');await new Promise(resolve=>{if(browser.exitCode!==null)return resolve();browser.once('exit',resolve);setTimeout(resolve,3000)});}
 if(server)await new Promise(resolve=>server.close(resolve));
 await rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}

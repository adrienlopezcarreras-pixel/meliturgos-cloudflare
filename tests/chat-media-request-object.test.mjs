import test from 'node:test';
import assert from 'node:assert/strict';
import {inferChatMediaCapability} from '../src/api/chat-media-intent.js';
import {isEvolutionDevelopmentIntent} from '../src/evolution/chat-intent.js';
import worker from '../src/index.js';

test('the requested media object wins over nouns in the topic or purpose',()=>{
 for(const [text,id,type] of [
  ['Génère une vidéo sur la musique','media.video.generate'],
  ['Crée une image pour une vidéo','media.image.generate'],
  ['Crée un son pour une vidéo musicale','media.audio.generate'],
  ['Compose une musique pour une vidéo','media.music.generate'],
  ['Fais-moi écouter un son pour une vidéo','web.media.search','audio'],
  ['Montre une vidéo sur la musique','web.media.search','video'],
  ['Cherche 2 sons pour une vidéo','web.media.search','audio'],
 ]){
  const result=inferChatMediaCapability(text);assert.equal(result?.id,id,text);if(type)assert.equal(result.input.type,type,text);
 }
 assert.equal(inferChatMediaCapability('Montre une photo pour une vidéo'),null,'photos must reach the existing image-search route');
 assert.equal(inferChatMediaCapability('Montre une vidéo avec 3 sons').input.max_results,1,'a quantity in the subject is not a result count');
 assert.equal(inferChatMediaCapability('Cherche 2 sons pour une vidéo').input.max_results,2);
});

test('polite infinitive requests use the same capability path',()=>{
 for(const [text,id] of [
  ['Peux-tu me créer une image de montagne','media.image.generate'],
  ['Peux-tu générer une vidéo de montagne','media.video.generate'],
  ['Pourrais-tu me composer une musique douce','media.music.generate'],
  ['Peux-tu me trouver un son de pluie','web.media.search'],
  ['Pourrais-tu me faire écouter un son de pluie','web.media.search'],
 ])assert.equal(inferChatMediaCapability(text)?.id,id,text);
});

test('the correction preserves private-asset, documentation, negation and development boundaries',()=>{
 for(const text of ['Fais-moi écouter un son extrait de cette vidéo','Génère une vidéo à partir de cet audio','Analyse ma vidéo ci-jointe','Crée une image à partir de ma vidéo','Crée une image depuis https://example.org/private.png','Donne un exemple JSON de création vidéo','Ne crée pas une vidéo','Pourquoi créer une musique ?','Crée un module de génération vidéo','Crée un test pour le générateur audio'])assert.equal(inferChatMediaCapability(text),null,text);
 assert.equal(isEvolutionDevelopmentIntent('Crée un module de génération vidéo'),true);
 assert.equal(isEvolutionDevelopmentIntent('Crée un test pour le générateur audio'),true);
 assert.equal(isEvolutionDevelopmentIntent('Peux-tu me créer une image de code'),false);
});

test('real chat dispatch creates the requested video, not music mentioned in its subject',async()=>{
 const calls=[];
 const env={MELITURGOS_USER:'fixture',MELITURGOS_PASSWORD:'fixture-password',AI:{async run(){return {response:'Le résultat est joint.'};}},MEL_MEDIA_CAPABILITIES:{
  'media.video.generate':async input=>{calls.push(['video',input]);return {ok:true,provider:'fixture',media:[{type:'video',url:'https://cdn.example/clip',mime:'video/webm'}]};},
  'media.music.generate':async()=>{calls.push(['music']);throw new Error('WRONG_TOOL');},
 }};
 const response=await worker.fetch(new Request('https://mel.example/api/chat',{method:'POST',headers:{authorization:'Basic '+btoa('fixture:fixture-password'),'content-type':'application/json'},body:JSON.stringify({text:'Génère une vidéo sur la musique'})}),env);
 const result=await response.json();assert.equal(response.status,200);assert.equal(calls.length,1);assert.equal(calls[0][0],'video');assert.equal(result.media[0]?.type,'video');assert.ok(result.tool_results.some(row=>row.capability==='media.video.generate'&&row.status==='SUCCEEDED'));
});

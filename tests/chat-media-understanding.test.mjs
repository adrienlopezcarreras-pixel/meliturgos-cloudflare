import test from 'node:test';
import assert from 'node:assert/strict';
import {inferChatMediaCapability} from '../src/api/chat-media-intent.js';
import {inferPublicImageLookup} from '../src/api/native-chat.js';
import {isEvolutionDevelopmentIntent} from '../src/evolution/chat-intent.js';
import worker from '../src/index.js';

// Task-specific deterministic evaluation, not a benchmark of model intelligence.
const cases=[
 ['Montre le code pour afficher une vidéo',null],
 ['Montre les différences entre une photo et une vidéo',null],
 ['Cherche un tutoriel pour convertir une image',null],
 ['Montre-moi comment générer une vidéo',null],
 ['Donne-moi la définition du mot image',null],
 ['Peux-tu me montrer trois photos de chats','web.images.search',3],
 ['Pourrais-tu me montrer une vidéo de chat','web.media.search',1,'video'],
 ['Cherche deux sons pour une vidéo','web.media.search',2,'audio'],
 ['Montre-moi une vidéo avec trois photos','web.media.search',1,'video'],
 ['Affiche une image pour illustrer une vidéo','web.images.search',1],
 ['Trouve-moi une jolie photo de montagne','web.images.search',1],
 ['Cherche sur internet une photo de Rome','web.images.search',1],
 ['Affiche l’image de Jupiter','web.images.search',1],
 ["Cherche l'enregistrement du chant des baleines",'web.media.search',1,'audio'],
 ["J’aimerais voir trois images de Rome",'web.images.search',3],
 ["J'aimerais écouter un son de pluie",'web.media.search',1,'audio'],
 ['Crée-moi une image pour une vidéo','media.image.generate'],
 ['Crée moi une vidéo sur la musique','media.video.generate'],
 ['Compose une musique pour une image','media.music.generate'],
 ['Cherche 100 vidéos de mer','web.media.search',6,'video'],
 ['Cherche 0 vidéos de mer','web.media.search',1,'video'],
 ['Cherche des images dans mon fichier',null],
 ['Montre cette image',null],
 ['Montre-moi ma photo',null],
 ['Montre mes images',null],
 ['Montre une image depuis https://private.example/image',null],
 ['Montre une image ci-jointe',null],
 ['Ne cherche pas une vidéo',null],
 ['Montre une image mais ne cherche pas sur internet',null],
 ['Pourquoi la photo ne s’affiche pas ?',null],
 ['Comment analyser une vidéo ?',null],
 ['Donne un exemple JSON de recherche vidéo',null],
 ['Crée un module pour afficher les vidéos',null],
];
for(const [text,id,count,type] of cases)test('media request meaning: '+text,()=>{
 const actual=inferChatMediaCapability(text);
 assert.equal(actual?.id||null,id);
 if(count)assert.equal(actual.input.max_images||actual.input.max_results,count);
 if(type)assert.equal(actual.input.type,type);
 const image=inferPublicImageLookup(text);
 assert.deepEqual(image,id==='web.images.search'?actual:null,'image routing uses the same source of truth');
 if(id)assert.equal(isEvolutionDevelopmentIntent(text),false,'retrieval and creation never enqueue code development');
});

test('literal speech content is not mistaken for file access or a web request',()=>{
 for(const text of ['mon fichier contient https://example.org','comment créer cette image','Ne supprime aucun fichier']){
  const request='Peux-tu me lire à voix haute : '+text;
  assert.deepEqual(inferChatMediaCapability(request),{id:'media.audio.synthesize',input:{text}});
  assert.equal(inferPublicImageLookup(request),null);
 }
 assert.equal(inferChatMediaCapability('Lis à voix haute mon fichier'),null,'an absent file is never guessed');
});

function request(text){return new Request('https://mel.example/api/chat',{method:'POST',headers:{authorization:'Basic '+btoa('fixture:fixture-password'),'content-type':'application/json'},body:JSON.stringify({text,conversation_id:'media-understanding'})});}
test('a polite photo request executes the real image route and returns the requested count',async()=>{
 let searches=0;
 const env={MELITURGOS_USER:'fixture',MELITURGOS_PASSWORD:'fixture-password',MEL_WEB_MIN_INTERVAL_MS:0,AI:{async run(){return {response:'Voici les résultats.'};}},async MEL_WEB_FETCH(url){searches++;assert.equal(new URL(url).hostname,'commons.wikimedia.org');return Response.json({query:{pages:Object.fromEntries([1,2,3].map(n=>[n,{index:n,title:'Chat '+n,imageinfo:[{url:'https://upload.wikimedia.org/chat'+n+'.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Chat'+n,mime:'image/jpeg'}]}]))}});}};
 const response=await worker.fetch(request('Peux-tu me montrer trois photos de chats'),env);
 const data=await response.json();assert.equal(response.status,200);assert.equal(searches,1);assert.equal(data.media.length,3);assert.equal(data.references.length,3);assert.ok(data.tool_results.some(row=>row.capability==='web.images.search'&&row.status==='SUCCEEDED'));
});

test('an explanatory comparison never dispatches an image or video search',async()=>{
 let searches=0;
 const env={MELITURGOS_USER:'fixture',MELITURGOS_PASSWORD:'fixture-password',AI:{async run(){return {response:'Une photo est une image fixe. Une vidéo représente une suite d’images dans le temps.'};}},async MEL_WEB_FETCH(){searches++;throw new Error('UNEXPECTED_MEDIA_SEARCH');}};
 const response=await worker.fetch(request('Montre les différences entre une photo et une vidéo'),env);
 const data=await response.json();assert.equal(response.status,200);assert.equal(searches,0);assert.equal(data.media.length,0);assert.ok(!data.tool_results.some(row=>['web.images.search','web.media.search'].includes(row.capability)));assert.match(data.text,/image fixe/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  handlePublicWordPressChat,
  publicWordPressChatCors,
} from '../../src/api/public-wordpress-chat.js';
import { renderPublicWordPressChatPage } from '../../src/pages/public-wordpress-chat-page.js';

test('MEL-CONN-01 public chat rejects foreign browser origins', async () => {
  const request=new Request('https://mel.example/api/public/wordpress/chat',{
    method:'POST',
    headers:{origin:'https://evil.example','content-type':'application/json'},
    body:JSON.stringify({message:'bonjour'}),
  });
  const response=await handlePublicWordPressChat(request,{AI:{run:async()=>({response:'x'})}});
  assert.equal(response.status,403);
  assert.equal((await response.json()).error,'PUBLIC_ORIGIN_FORBIDDEN');
});

test('MEL-CONN-01 CORS is limited to verite-interdite.fr', async () => {
  const ok=publicWordPressChatCors(new Request('https://mel.example/api/public/wordpress/chat',{
    method:'OPTIONS',
    headers:{origin:'https://verite-interdite.fr'},
  }));
  assert.equal(ok.status,204);
  assert.equal(ok.headers.get('access-control-allow-origin'),'https://verite-interdite.fr');
  const denied=publicWordPressChatCors(new Request('https://mel.example/api/public/wordpress/chat',{
    method:'OPTIONS',
    headers:{origin:'https://other.example'},
  }));
  assert.equal(denied.status,403);
});

test('MEL-CONN-01 public chat fails closed without Workers AI', async () => {
  const request=new Request('https://mel.example/api/public/wordpress/chat',{
    method:'POST',
    headers:{origin:'https://verite-interdite.fr','content-type':'application/json'},
    body:JSON.stringify({message:'histoire'}),
  });
  const response=await handlePublicWordPressChat(request,{});
  assert.equal(response.status,503);
  assert.equal((await response.json()).error,'PUBLIC_AI_UNAVAILABLE');
});

test('MEL-CONN-01 answers from public WordPress search results only', async () => {
  const originalFetch=globalThis.fetch;
  const seen=[];
  globalThis.fetch=async (url,options={})=>{
    seen.push({url:String(url),options});
    return Response.json([
      {id:42,title:'Un dossier public',url:'https://verite-interdite.fr/dossier',subtype:'post'},
    ]);
  };
  try{
    let aiInput=null;
    const env={AI:{run:async (_model,input)=>{aiInput=input;return {response:'Voici le dossier public pertinent.'};}}};
    const request=new Request('https://mel.example/api/public/wordpress/chat',{
      method:'POST',
      headers:{origin:'https://verite-interdite.fr','content-type':'application/json'},
      body:JSON.stringify({message:'Je cherche un dossier'}),
    });
    const response=await handlePublicWordPressChat(request,env);
    assert.equal(response.status,200);
    const payload=await response.json();
    assert.equal(payload.ok,true);
    assert.equal(payload.scope,'PUBLIC_ONLY');
    assert.equal(payload.sources.length,1);
    assert.equal(new URL(seen[0].url).origin,'https://verite-interdite.fr');
    assert.match(JSON.stringify(aiInput),/RESULTATS_PUBLICS/);
    assert.match(JSON.stringify(aiInput),/Un dossier public/);
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test('MEL-CONN-01 endpoint source has no private-memory or owner-chat dependency', async () => {
  const source=await readFile(new URL('../../src/api/public-wordpress-chat.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/native-chat|conversation-service|retrieveContext|private_memory|saved_memories|owner_profile|Gmail|Google_Drive/);
  assert.doesNotMatch(source,/env\.DB|MEDIA_BUCKET/);
  assert.match(source,/scope:'PUBLIC_ONLY'/);
  assert.match(source,/@cf\/zai-org\/glm-4\.7-flash/);
});


test('MEL-CONN-01 embeddable page posts only to the isolated public endpoint', () => {
  const html=renderPublicWordPressChatPage();
  assert.match(html,/\/api\/public\/wordpress\/chat/);
  assert.match(html,/maxlength="1200"/);
  assert.match(html,/verite-interdite\.fr/);
  assert.doesNotMatch(html,/owner|private_memory|saved_memories|conversation_history|Gmail|Google_Drive/i);
});

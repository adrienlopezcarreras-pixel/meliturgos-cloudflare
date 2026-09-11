import test from 'node:test';
import assert from 'node:assert/strict';
import { MEL_AVATAR_URL, MEL_INTERFACE_FINALIZER, finalizeMvpInterface } from '../src/pages/mvp-interface-finalizer.js';

test('final interface voice uses MediaRecorder without persistent helper copy',()=>{
  assert.match(MEL_INTERFACE_FINALIZER,/MediaRecorder/);
  assert.match(MEL_INTERFACE_FINALIZER,/getUserMedia/);
  assert.match(MEL_INTERFACE_FINALIZER,/\/api\/voice\/transcribe/);
  assert.match(MEL_INTERFACE_FINALIZER,/stopImmediatePropagation/);
  assert.doesNotMatch(MEL_INTERFACE_FINALIZER,/Présente, attentive, prête à avancer avec toi\./);
  assert.doesNotMatch(MEL_INTERFACE_FINALIZER,/MEL veille et prie en silence\./);
});

test('final interface forces the approved Spanish MEL avatar with a cache-busting version',()=>{
  assert.match(MEL_AVATAR_URL,/cdn\.openart\.ai/);
  assert.match(MEL_AVATAR_URL,/mel-spanish-20260911-2/);
  assert.match(MEL_INTERFACE_FINALIZER,/avatarImage\.src/);
});

test('final interface exposes real last-conversation recall',()=>{
  assert.match(MEL_INTERFACE_FINALIZER,/Rappeler la dernière conversation/);
  assert.match(MEL_INTERFACE_FINALIZER,/\/api\/gen2\/conversations/);
  assert.match(MEL_INTERFACE_FINALIZER,/conversations\/messages\?conversation_id=/);
  assert.match(MEL_INTERFACE_FINALIZER,/mel\.conversation/);
});

test('finalizer strips owner-rejected static copy and injects once into HTML only',async()=>{
  const source='<html><body><div id="avatar"><img src="old.webp"></div><div id="voiceStatus">Touchez le visage de MEL pour parler · le texte reste toujours disponible</div><div>MEL veille et prie en silence.</div><div id="messages"></div><textarea id="input"></textarea><button id="send"></button></body></html>';
  const first=await finalizeMvpInterface(new Response(source,{headers:{'content-type':'text/html'}}));
  const once=await first.text();
  assert.equal((once.match(/id="mel-interface-finalizer-runtime"/g)||[]).length,1);
  assert.doesNotMatch(once,/MEL veille et prie en silence\./);
  assert.doesNotMatch(once,/Touchez le visage de MEL pour parler · le texte reste toujours disponible/);
  const second=await finalizeMvpInterface(new Response(once,{headers:{'content-type':'text/html'}}));
  assert.equal(((await second.text()).match(/id="mel-interface-finalizer-runtime"/g)||[]).length,1);
});

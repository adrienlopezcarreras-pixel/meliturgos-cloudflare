import test from 'node:test';
import assert from 'node:assert/strict';
import { MEL_INTERFACE_FINALIZER, finalizeMvpInterface } from '../src/pages/mvp-interface-finalizer.js';

test('final interface voice uses MediaRecorder and blocks legacy avatar listeners first',()=>{
  assert.match(MEL_INTERFACE_FINALIZER,/MediaRecorder/);
  assert.match(MEL_INTERFACE_FINALIZER,/getUserMedia/);
  assert.match(MEL_INTERFACE_FINALIZER,/\/api\/voice\/transcribe/);
  assert.match(MEL_INTERFACE_FINALIZER,/stopImmediatePropagation/);
  assert.match(MEL_INTERFACE_FINALIZER,/Touchez le visage de MEL pour parler/);
  assert.match(MEL_INTERFACE_FINALIZER,/Reconnaissance vocale non disponible/i);
});

test('final interface exposes real last-conversation recall',()=>{
  assert.match(MEL_INTERFACE_FINALIZER,/Rappeler la dernière conversation/);
  assert.match(MEL_INTERFACE_FINALIZER,/\/api\/gen2\/conversations/);
  assert.match(MEL_INTERFACE_FINALIZER,/conversations\/messages\?conversation_id=/);
  assert.match(MEL_INTERFACE_FINALIZER,/mel\.conversation/);
});

test('finalizer injects once into HTML only',async()=>{
  const source='<html><body><div id="avatar"></div><div id="voiceStatus"></div><div id="messages"></div><textarea id="input"></textarea><button id="send"></button></body></html>';
  const first=await finalizeMvpInterface(new Response(source,{headers:{'content-type':'text/html'}}));
  const once=await first.text();
  assert.equal((once.match(/id="mel-interface-finalizer-runtime"/g)||[]).length,1);
  const second=await finalizeMvpInterface(new Response(once,{headers:{'content-type':'text/html'}}));
  assert.equal(((await second.text()).match(/id="mel-interface-finalizer-runtime"/g)||[]).length,1);
});

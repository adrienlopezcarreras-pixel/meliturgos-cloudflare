import test from 'node:test';
import assert from 'node:assert/strict';
import { MEL_AVATAR_URL, MEL_INTERFACE_FINALIZER, finalizeMvpInterface } from '../src/pages/mvp-interface-finalizer.js';

test('final interface stays simple and removes rejected helper copy',()=>{
  assert.match(MEL_INTERFACE_FINALIZER,/Lectures du jour/);
  assert.match(MEL_INTERFACE_FINALIZER,/Mode complet/);
  assert.match(MEL_INTERFACE_FINALIZER,/aelf\.org/);
  assert.match(MEL_INTERFACE_FINALIZER,/theme-switch\{display:block/);
  assert.doesNotMatch(MEL_INTERFACE_FINALIZER,/Présente, attentive, prête à avancer avec toi\./);
  assert.doesNotMatch(MEL_INTERFACE_FINALIZER,/Touchez le visage de MEL pour parler · le texte reste toujours disponible/);
  assert.doesNotMatch(MEL_INTERFACE_FINALIZER,/MEL veille et prie en silence\./);
});

test('final interface synchronizes MEL avatar with the active theme instead of forcing one portrait',()=>{
  assert.equal(MEL_AVATAR_URL,'/assets/avatars/mel-classic.webp');
  assert.match(MEL_INTERFACE_FINALIZER,/const AVATARS=/);
  assert.match(MEL_INTERFACE_FINALIZER,/mel-crusade\.webp/);
  assert.match(MEL_INTERFACE_FINALIZER,/mel-religious-andalusian\.webp/);
  assert.match(MEL_INTERFACE_FINALIZER,/mel-aviation-1940s\.webp/);
  assert.match(MEL_INTERFACE_FINALIZER,/mel-paladin-light-full-plate\.webp/);
  assert.match(MEL_INTERFACE_FINALIZER,/mel-amazon-griffon\.webp/);
  assert.match(MEL_INTERFACE_FINALIZER,/MutationObserver\(syncAvatar\)/);
  assert.doesNotMatch(MEL_INTERFACE_FINALIZER,/mel-spanish-20260911\.webp/);
});

test('final interface uses resolution-independent scenes instead of stretched theme bitmaps',()=>{
  assert.match(MEL_INTERFACE_FINALIZER,/--mel-scene:/);
  assert.match(MEL_INTERFACE_FINALIZER,/data-theme="granada"/);
  assert.match(MEL_INTERFACE_FINALIZER,/data-theme="amazon"/);
  assert.doesNotMatch(MEL_INTERFACE_FINALIZER,/assets\/themes\/mel-/);
});

test('finalizer strips owner-rejected static copy and injects once into HTML only',async()=>{
  const source='<html><body><div id="avatar"><img src="old.webp"></div><div id="voiceStatus">Touchez le visage de MEL pour parler · le texte reste toujours disponible</div><div>Présente, attentive, prête à avancer avec toi.</div><div>MEL veille et prie en silence.</div><div>Touchez son visage pour parler</div><div class="controls"><button id="full"></button></div></body></html>';
  const first=await finalizeMvpInterface(new Response(source,{headers:{'content-type':'text/html'}}));
  const once=await first.text();
  assert.equal((once.match(/id="mel-interface-finalizer-runtime"/g)||[]).length,1);
  assert.doesNotMatch(once,/Présente, attentive, prête à avancer avec toi\./);
  assert.doesNotMatch(once,/MEL veille et prie en silence\./);
  assert.doesNotMatch(once,/Touchez le visage de MEL pour parler · le texte reste toujours disponible/);
  assert.doesNotMatch(once,/Touchez son visage pour parler/);
  assert.match(once,/Lectures du jour/);
  assert.doesNotMatch(once,/>Évangile du jour</);
  assert.doesNotMatch(once,/>Psaume du jour</);
  const second=await finalizeMvpInterface(new Response(once,{headers:{'content-type':'text/html'}}));
  assert.equal(((await second.text()).match(/id="mel-interface-finalizer-runtime"/g)||[]).length,1);
});

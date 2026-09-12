import test from 'node:test';
import assert from 'node:assert/strict';
import { MEL_AVATAR_URL, MEL_INTERFACE_FINALIZER, finalizeMvpInterface } from '../src/pages/mvp-interface-finalizer.js';

test('final normal interface stays simple and removes rejected helper controls',()=>{
  assert.doesNotMatch(MEL_INTERFACE_FINALIZER,/Lectures du jour|Évangile du jour|Psaume du jour|Audit MEL/);
  assert.match(MEL_INTERFACE_FINALIZER,/Mode complet/);
  assert.match(MEL_INTERFACE_FINALIZER,/theme-switch\{display:block/);
  assert.match(MEL_INTERFACE_FINALIZER,/grid-template-columns:1\.25fr 1fr/);
  assert.doesNotMatch(MEL_INTERFACE_FINALIZER,/Présente, attentive, prête à avancer avec toi\./);
  assert.doesNotMatch(MEL_INTERFACE_FINALIZER,/MEL veille et prie en silence\./);
});

test('final interface synchronizes MEL avatar with the active chosen theme',()=>{
  assert.equal(MEL_AVATAR_URL,'/assets/avatars/mel-classic.webp');
  assert.match(MEL_INTERFACE_FINALIZER,/const AVATARS=/);
  assert.match(MEL_INTERFACE_FINALIZER,/mel-crusade\.webp/);
  assert.match(MEL_INTERFACE_FINALIZER,/mel-religious-andalusian\.webp/);
  assert.match(MEL_INTERFACE_FINALIZER,/mel-aviation-1940s\.webp/);
  assert.match(MEL_INTERFACE_FINALIZER,/mel-paladin-light-full-plate\.webp/);
  assert.match(MEL_INTERFACE_FINALIZER,/mel-amazon-griffon\.webp/);
  assert.match(MEL_INTERFACE_FINALIZER,/MutationObserver\(syncAvatar\)/);
});

test('final interface uses the already selected full-screen theme images with cover sizing',()=>{
  for (const name of ['mel-crusade.webp','mel-religious.webp','mel-granada.webp','mel-aviation.webp','mel-paladin.webp','mel-amazon.webp']) assert.match(MEL_INTERFACE_FINALIZER,new RegExp(name.replace('.','\\.')));
  assert.match(MEL_INTERFACE_FINALIZER,/background-size:cover/);
  assert.match(MEL_INTERFACE_FINALIZER,/data-theme="granada"/);
  assert.match(MEL_INTERFACE_FINALIZER,/data-theme="amazon"/);
});

test('finalizer injects once and defensively removes obsolete normal-mode controls',async()=>{
  const source='<html><body><div id="avatar"><img src="old.webp"></div><div id="voiceStatus"></div><div class="controls"><button id="send"></button><button id="full"></button><button id="melReadingsToday">Lectures du jour</button></div><details id="melAudit">Audit MEL</details></body></html>';
  const first=await finalizeMvpInterface(new Response(source,{headers:{'content-type':'text/html'}}));
  const once=await first.text();
  assert.equal((once.match(/id="mel-interface-finalizer-runtime"/g)||[]).length,1);
  assert.match(once,/melReadingsToday/);
  assert.match(once,/melAudit/);
  assert.match(once,/remove\(\)/);
  const second=await finalizeMvpInterface(new Response(once,{headers:{'content-type':'text/html'}}));
  assert.equal(((await second.text()).match(/id="mel-interface-finalizer-runtime"/g)||[]).length,1);
});

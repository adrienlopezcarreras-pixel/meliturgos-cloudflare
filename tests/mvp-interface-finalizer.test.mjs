import test from 'node:test';
import assert from 'node:assert/strict';
import { MEL_AVATAR_URL, MEL_INTERFACE_FINALIZER, finalizeMvpInterface } from '../src/pages/mvp-interface-finalizer.js';

test('final interface stays simple and removes rejected helper copy',()=>{
  assert.match(MEL_INTERFACE_FINALIZER,/Évangile du jour/);
  assert.match(MEL_INTERFACE_FINALIZER,/Psaume du jour/);
  assert.match(MEL_INTERFACE_FINALIZER,/Mode complet/);
  assert.match(MEL_INTERFACE_FINALIZER,/aelf\.org/);
  assert.doesNotMatch(MEL_INTERFACE_FINALIZER,/Présente, attentive, prête à avancer avec toi\./);
  assert.doesNotMatch(MEL_INTERFACE_FINALIZER,/Touchez le visage de MEL pour parler · le texte reste toujours disponible/);
  assert.doesNotMatch(MEL_INTERFACE_FINALIZER,/MEL veille et prie en silence\./);
});

test('final interface forces the approved local Spanish MEL avatar',()=>{
  assert.equal(MEL_AVATAR_URL,'/assets/avatars/mel-spanish-20260911.webp');
  assert.match(MEL_INTERFACE_FINALIZER,/avatarImage\.src/);
  assert.match(MEL_INTERFACE_FINALIZER,/mel-spanish-20260911\.webp/);
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
  assert.match(once,/Évangile du jour/);
  assert.match(once,/Psaume du jour/);
  const second=await finalizeMvpInterface(new Response(once,{headers:{'content-type':'text/html'}}));
  assert.equal(((await second.text()).match(/id="mel-interface-finalizer-runtime"/g)||[]).length,1);
});

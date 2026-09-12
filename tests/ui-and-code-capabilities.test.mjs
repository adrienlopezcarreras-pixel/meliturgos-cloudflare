import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inferNativeCodeCapability } from '../src/api/native-chat.js';
import { onRequestGet as renderFullMode } from '../src/pages/full-interface-v5.js';
import { MEL_AVATAR_URL, MEL_INTERFACE_FINALIZER } from '../src/pages/mvp-interface-finalizer.js';

test('code questions are routed by the native chat capability path', () => {
  assert.deepEqual(inferNativeCodeCapability('Peux-tu accéder à ton code et chercher ModelRouter ?'), {
    id: 'code.read', input: { path: 'src/router.js' }
  });
  assert.deepEqual(inferNativeCodeCapability('Cherche dans ton code createDefaultCapabilityBus'), {
    id: 'code.search', input: { query: 'dans ton code createDefaultCapabilityBus' }
  });
});

test('explicit code file requests are routed to code.read', () => {
  assert.deepEqual(inferNativeCodeCapability('Lis le fichier src/router.js'), {
    id: 'code.read', input: { path: 'src/router.js' }
  });
  assert.equal(inferNativeCodeCapability('Quel temps fait-il ?'), null);
});

test('native code routing understands follow-up access questions from recent context', () => {
  assert.deepEqual(
    inferNativeCodeCapability('Donc tu peux vraiment le lire ?', [{ content: 'Nous parlions de ton code dans le repo GitHub.' }]),
    { id: 'code.read', input: { path: 'src/router.js' } }
  );
});

test('simple mode finalizer uses canonical per-theme avatars and only essential daily/full-mode controls', () => {
  assert.equal(MEL_AVATAR_URL, '/assets/avatars/mel-classic.webp');
  assert.match(MEL_INTERFACE_FINALIZER, /const AVATARS=/);
  assert.match(MEL_INTERFACE_FINALIZER, /MutationObserver\(syncAvatar\)/);
  assert.doesNotMatch(MEL_INTERFACE_FINALIZER, /mel-spanish-20260911\.webp/);
  assert.match(MEL_INTERFACE_FINALIZER, /Lectures du jour/);
  assert.match(MEL_INTERFACE_FINALIZER, /Mode complet/);
  assert.match(MEL_INTERFACE_FINALIZER, /aelf\.org/);
  assert.match(MEL_INTERFACE_FINALIZER, /theme-switch\{display:block/);
  assert.doesNotMatch(MEL_INTERFACE_FINALIZER, /MEL veille et prie en silence/);
});

test('full mode keeps MEL responsive and provides fast verified reading controls', async () => {
  const page = await (await renderFullMode({})).text();
  const router = await readFile(new URL('../src/router.js', import.meta.url), 'utf8');
  assert.match(page, /MEL Control Room|Control Room/);
  assert.match(page, /Adrien · MEL · Mentor/);
  assert.match(page, /Salon Adrien · MEL · Teacher/);
  assert.match(page, /Mode zéro-euro/);
  assert.match(page, /Teacher autonome/);
  assert.match(page, /Promise\.allSettled/);
  assert.match(page, /Statut MEL/);
  assert.match(page, /MODE COMPLET — CONSIGNE DE STYLE PRIORITAIRE/);
  assert.match(page, /français normal, moderne, direct et professionnel/);
  assert.match(page, /resize:vertical/);
  assert.match(page, /Dernière réponse/);
  assert.match(page, /Grande lecture/);
  assert.match(page, /<button[^>]+data-view="multi"/);
  assert.match(page, /F5 revient ici/);
  assert.match(page, /Multi-IA/);
  assert.match(page, /Feuille de route/);
  assert.match(page, /mel-spanish-20260911\.webp/);
  assert.match(router, /full-interface-v5/);
  assert.match(router, /\/api\/gen2\/mentor\/chat/);
  assert.match(router, /\/api\/gen2\/mentor\/status/);
  assert.match(router, /\/professor-legacy/);
});

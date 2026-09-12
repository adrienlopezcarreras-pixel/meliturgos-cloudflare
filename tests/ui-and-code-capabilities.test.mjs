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

test('simple mode finalizer keeps only useful controls and a resilient themed avatar', () => {
  assert.equal(MEL_AVATAR_URL, '/assets/avatars/mel-classic.webp');
  assert.match(MEL_INTERFACE_FINALIZER, /const AVATARS=/);
  assert.match(MEL_INTERFACE_FINALIZER, /MutationObserver\(syncAvatar\)/);
  assert.match(MEL_INTERFACE_FINALIZER, /meliturgos-avatar-fille\.png/);
  assert.match(MEL_INTERFACE_FINALIZER, /Lectures du jour/);
  assert.match(MEL_INTERFACE_FINALIZER, /Mode complet/);
  assert.match(MEL_INTERFACE_FINALIZER, /aelf\.org/);
  assert.match(MEL_INTERFACE_FINALIZER, /uiFinal='normal-v1'/);
  assert.doesNotMatch(MEL_INTERFACE_FINALIZER, /MEL veille et prie en silence/);
});

test('full mode is unified, responsive and evidence-based', async () => {
  const page = await (await renderFullMode({})).text();
  const router = await readFile(new URL('../src/router.js', import.meta.url), 'utf8');
  assert.match(page, /MEL · Mode complet/);
  assert.match(page, /Salon IA/);
  assert.match(page, /Mentor MEL/);
  assert.match(page, /Conseil Multi-IA/);
  assert.match(page, /Promise\.allSettled/);
  assert.match(page, /MODE COMPLET — CONSIGNE DE STYLE PRIORITAIRE/);
  assert.match(page, /français normal, moderne, direct et professionnel/);
  assert.match(page, /resize:vertical/);
  assert.match(page, /<button[^>]+data-view="salon"/);
  assert.match(page, /Roadmap/);
  assert.match(page, /\/meliturgos-avatar-fille\.png/);
  assert.doesNotMatch(page, /Statut MEL|Prochaine tâche|Fin du chat|Grande lecture/);
  assert.match(router, /full-interface-v5/);
  assert.match(router, /\/api\/gen2\/mentor\/chat/);
  assert.match(router, /\/api\/gen2\/mentor\/status/);
  assert.match(router, /\/professor-legacy/);
});

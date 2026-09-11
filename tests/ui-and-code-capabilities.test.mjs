import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inferNativeCodeCapability } from '../src/api/native-chat.js';

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

test('home UI uses avatar favicon, no redundant MEL heading and larger mobile target', async () => {
  const source = await readFile(new URL('../src/pages/mvp-interface.js', import.meta.url), 'utf8');
  assert.match(source, /rel="icon"[^>]+meliturgos-avatar-fille\.png/);
  assert.doesNotMatch(source, /class="title">MEL/);
  assert.match(source, /min-width:188px/);
  assert.match(source, /Touchez son visage pour parler/);
});

test('full mode uses the current v2 control center while legacy Professor remains recoverable', async () => {
  const page = await readFile(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8');
  const router = await readFile(new URL('../src/router.js', import.meta.url), 'utf8');
  assert.match(page, /Centre de contrôle/);
  assert.match(page, /Multi-IA/);
  assert.match(page, /Feuille de route/);
  assert.match(page, /meliturgos-avatar-fille\.png/);
  assert.match(router, /handleFullModeV2/);
  assert.match(router, /\/professor-legacy/);
});

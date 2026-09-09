import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inferCodeCapability } from '../src/router.js';

test('code questions are routed to search automatically', () => {
  assert.deepEqual(inferCodeCapability('Peux-tu accéder à ton code et chercher ModelRouter ?'), {
    id: 'code.search', input: { query: 'ModelRouter' }
  });
  assert.deepEqual(inferCodeCapability('Cherche dans ton code createDefaultCapabilityBus'), {
    id: 'code.search', input: { query: 'createDefaultCapabilityBus' }
  });
});

test('explicit code file requests are routed to code.read', () => {
  assert.deepEqual(inferCodeCapability('Lis le fichier src/router.js'), {
    id: 'code.read', input: { path: 'src/router.js' }
  });
  assert.equal(inferCodeCapability('Quel temps fait-il ?'), null);
});

test('home UI uses avatar favicon, no redundant MEL heading and larger mobile target', async () => {
  const source = await readFile(new URL('../src/pages/mvp-interface.js', import.meta.url), 'utf8');
  assert.match(source, /rel="icon"[^>]+meliturgos-avatar-fille\.png/);
  assert.doesNotMatch(source, /class="title">MEL</);
  assert.match(source, /min-width:188px/);
  assert.match(source, /Touchez son visage pour parler/);
});

test('full mode is a separate contemporary interface and legacy Professor remains recoverable', async () => {
  const page = await readFile(new URL('../src/pages/full-interface.js', import.meta.url), 'utf8');
  const router = await readFile(new URL('../src/router.js', import.meta.url), 'utf8');
  assert.match(page, /Centre de contrôle/);
  assert.match(page, /\.augmentio/);
  assert.match(page, /professor-legacy/);
  assert.match(page, /meliturgos-avatar-fille\.png/);
  assert.match(router, /handleFullMode/);
  assert.match(router, /\/professor-legacy/);
});

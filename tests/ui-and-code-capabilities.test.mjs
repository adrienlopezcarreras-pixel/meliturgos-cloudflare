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
  assert.deepEqual(inferCodeCapability('cherche dans ton code où est définie la fonction buildContext'), {
    id: 'code.search', input: { query: 'buildContext' }
  });
  assert.deepEqual(inferCodeCapability('trouve dans le dépôt où est utilisé createDefaultAugmentioPool'), {
    id: 'code.search', input: { query: 'createDefaultAugmentioPool' }
  });
});

test('explicit code file requests are routed to code.read', () => {
  assert.deepEqual(inferCodeCapability('Lis le fichier src/router.js'), {
    id: 'code.read', input: { path: 'src/router.js' }
  });
  assert.equal(inferCodeCapability('Quel temps fait-il ?'), null);
});

test('legacy home UI source is now a strict redirect to canonical Professor', async () => {
  const source = await readFile(new URL('../src/pages/mvp-interface.js', import.meta.url), 'utf8');
  assert.match(source, /status:\s*308/);
  assert.match(source, /location:\s*["']\/professor["']/);
  assert.match(source, /cache-control["']?:\s*["']no-store["']/);
  assert.doesNotMatch(source, /<title>MEL<\/title>/);
});

test('canonical full mode is contemporary while legacy full mode and Professor legacy remain recoverable', async () => {
  const canonical = await readFile(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8');
  const compatibility = await readFile(new URL('../src/pages/full-interface.js', import.meta.url), 'utf8');
  const router = await readFile(new URL('../src/router.js', import.meta.url), 'utf8');
  assert.match(canonical, /Centre de contrôle/);
  assert.match(canonical, /data-panel="roadmap"/);
  assert.match(canonical, /data-panel="work"/);
  assert.match(canonical, /meliturgos-avatar-fille\.png/);
  assert.match(compatibility, /status:\s*308/);
  assert.match(compatibility, /location:\s*["']\/professor["']/);
  assert.match(router, /handleFullModeV2/);
  assert.match(router, /\/professor-legacy/);
});

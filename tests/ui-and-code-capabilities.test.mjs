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

test('normal home UI remains available while v1 redirects to canonical Professor', async () => {
  const mvp = await readFile(new URL('../src/pages/mvp-interface.js', import.meta.url), 'utf8');
  const v1 = await readFile(new URL('../src/pages/full-interface.js', import.meta.url), 'utf8');
  assert.match(mvp, /<title>MEL<\/title>/);
  assert.match(mvp, /id="avatar"/);
  assert.match(mvp, /id="full"/);
  assert.match(mvp, /location\.href='\/professor'/);
  assert.doesNotMatch(mvp, /status:\s*308/);
  assert.match(v1, /status:\s*308/);
  assert.match(v1, /location:\s*["']\/professor["']/);
  assert.match(v1, /cache-control["']?:\s*["']no-store["']/);
});

test('canonical full mode remains the contemporary control center wired at /professor', async () => {
  const page = await readFile(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8');
  const router = await readFile(new URL('../src/router.js', import.meta.url), 'utf8');
  assert.match(page, /Centre de contrôle/);
  assert.match(page, /data-panel="roadmap"/);
  assert.match(page, /data-panel="work"/);
  assert.match(page, /data-panel="memory"/);
  assert.match(page, /data-panel="diagnostics"/);
  assert.match(page, /meliturgos-avatar-fille\.png/);
  assert.match(router, /handleFullModeV2/);
  assert.match(router, /url\.pathname === "\/professor"/);
});

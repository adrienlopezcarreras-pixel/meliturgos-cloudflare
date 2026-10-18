import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequestGet as watchPage } from '../src/pages/watch-interface.js';

test('watch owns a dedicated page with a side-effect-free test-all control', async () => {
  const response = await watchPage();
  const html = await response.text();
  assert.match(html, /<title>Veille MEL<\/title>/);
  assert.match(html, /Tester toutes les options de la veille/);
  assert.match(html, /\/api\/mel\/capability-watch\/test-all/);
  assert.match(html, /\/api\/mel\/capability-watch\/run/);
  assert.match(html, /\/api\/mel\/capability-watch\/proposal/);
  assert.match(html, /href="\/professor"/);
  assert.match(html, /ce qu’elle propose d’en faire/);
});


test('test-all endpoint disables discovery handoff while reusing the canonical watch engine', async () => {
  const [ui, runtime, router, preview] = await Promise.all([
    readFile(new URL('../src/ui-entry.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/evaluation/capability-watch-runtime.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/router.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/preview-auth-entry.js', import.meta.url), 'utf8'),
  ]);
  assert.match(ui, /\/api\/mel\/capability-watch\/test-all/);
  assert.match(ui, /allowHandoff:\s*false/);
  assert.match(runtime, /allowHandoff\s*=\s*true/);
  assert.match(runtime, /if \(allowHandoff && result\.status === 'RAN'/);
  assert.match(router, /url\.pathname === "\/veille"/);
  assert.match(preview, /'\/veille'/);
});

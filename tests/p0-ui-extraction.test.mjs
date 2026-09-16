import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as legacyMvp } from '../src/pages/mvp-interface.js';
import { onRequestGet as professorUi } from '../src/pages/full-interface-v2.js';

test('legacy MEL home is an explicit non-cached redirect to canonical Professor', async () => {
  const response = await legacyMvp({});
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), '/professor');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('canonical Professor interface is self-contained and keeps the active control surfaces', async () => {
  const response = await professorUi({});
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  const html = await response.text();
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<title>Mode complet<\/title>/);
  assert.match(html, /meliturgos-avatar-fille\.png/);
  assert.match(html, /data-panel="chat"/);
  assert.match(html, /data-panel="roadmap"/);
  assert.match(html, /data-panel="work"/);
  assert.match(html, /data-panel="memory"/);
  assert.match(html, /data-panel="diagnostics"/);
  assert.match(html, /id="chatInput"/);
  assert.match(html, /id="chatSend"/);
  assert.match(html, /jfetch\('\/api\/chat'/);
  assert.match(html, /e\.key==='Enter'/);
  assert.match(html, /Feuille de route complète/);
  assert.doesNotMatch(html, /interaction_count/i);
});

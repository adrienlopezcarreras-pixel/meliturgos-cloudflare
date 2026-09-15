import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as legacyMvp } from '../src/pages/mvp-interface.js';
import { onRequestGet as professorPage } from '../src/pages/full-interface-v2.js';

test('retired public MVP entry is a permanent no-store redirect to canonical /professor', async () => {
  const response = await legacyMvp({});
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), '/professor');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('canonical Professor interface is self-contained HTML with chat and complete control views', async () => {
  const response = await professorPage({});
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  const html = await response.text();
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<title>Mode complet<\/title>/);
  assert.match(html, /rel="icon"[^>]+meliturgos-avatar-fille\.png/);
  assert.match(html, /id="chatlog"/);
  assert.match(html, /id="chatInput"/);
  assert.match(html, /id="chatSend"/);
  assert.match(html, /fetch\(url,opts\)/);
  assert.match(html, /jfetch\('\/api\/chat'/);
  assert.match(html, /e\.key==='Enter'/);
  for (const panel of ['overview','chat','skills','roadmap','multi','work','memory','diagnostics']) {
    assert.match(html, new RegExp(`data-panel="${panel}"`));
  }
  assert.doesNotMatch(html, /conversationSelect|newConversation|interaction_count/i);
});

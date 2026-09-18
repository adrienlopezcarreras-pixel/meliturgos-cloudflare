import test from 'node:test';
import assert from 'node:assert/strict';
import { enhanceOwnerInterface } from '../src/ui-entry.js';

test('owner root interface remains the canonical v3 surface without legacy reinjection', async () => {
  const source = '<!doctype html><html><head></head><body><main data-visual-owner="mel-normal-v3"><textarea id="promptInput"></textarea><span id="previousMessage">Message précédent</span></main></body></html>';
  const input = new Response(source, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  const output = await enhanceOwnerInterface(input, '/');
  const html = await output.text();
  assert.equal(html, source);
  assert.doesNotMatch(html, /mel-owner-visual-fix|mel-normal-page-cleanup|melOwnerPreviousMessage/);
  assert.match(html, /data-visual-owner="mel-normal-v3"/);
  assert.match(html, /id="previousMessage"/);
});

test('full mode is not reinjected by the API entry layer', async () => {
  const source = '<!doctype html><html><head></head><body><main id="professor-canonical">Mode complet</main></body></html>';
  const input = new Response(source, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  const output = await enhanceOwnerInterface(input, '/professor');
  assert.equal(await output.text(), source);
  assert.doesNotMatch(source, /mel-full-page-cleanup|mel-full-avatar-fix|melLiveOwnerExplain/);
});

test('non-owner API responses are left untouched', async () => {
  const input = new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
  const output = await enhanceOwnerInterface(input, '/api/health'); assert.equal(await output.text(), '{"ok":true}');
});

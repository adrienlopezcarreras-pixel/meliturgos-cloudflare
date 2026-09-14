import test from 'node:test';
import assert from 'node:assert/strict';
import { enhanceOwnerInterface } from '../src/ui-entry.js';

test('owner root interface keeps approved backgrounds and removes redundant recall controls without restoring the obsolete contrast hack', async () => {
  const input = new Response('<!doctype html><html><head></head><body><div class="composer"><button class="mel-recall-last">Rappeler la dernière conversation</button><textarea placeholder="Écris ici"></textarea></div></body></html>', {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
  const output = await enhanceOwnerInterface(input, '/');
  const html = await output.text();
  assert.match(html, /mel-owner-approved-backgrounds/);
  assert.match(html, /mel-normal-page-cleanup/);
  assert.match(html, /removeRedundantRecall/);
  assert.match(html, /Rappeler la dernière conversation/);
  assert.match(html, /Reprendre la dernière conversation/);
  assert.doesNotMatch(html, /mel-owner-contrast-fix/);
  assert.doesNotMatch(html, /html body,html body \*\{color:#000!important/);
  assert.doesNotMatch(html, /mel-remove-recall-button/);
});

test('non-owner API responses are left untouched', async () => {
  const input = new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
  const output = await enhanceOwnerInterface(input, '/api/health');
  assert.equal(await output.text(), '{"ok":true}');
});

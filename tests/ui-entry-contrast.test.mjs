import test from 'node:test';
import assert from 'node:assert/strict';
import { enhanceOwnerInterface } from '../src/ui-entry.js';

test('owner root interface restores HD backgrounds, previous-message link and cleanup without obsolete contrast/title hacks', async () => {
  const input = new Response('<!doctype html><html><head></head><body><div id="melTitle">MEL IA + Développement</div><div class="composer"><button class="mel-recall-last">Rappeler la dernière conversation</button><textarea id="input" placeholder="Écris ici"></textarea><div id="messages"></div><div id="status"></div></div></body></html>', {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
  const output = await enhanceOwnerInterface(input, '/');
  const html = await output.text();
  assert.match(html, /mel-owner-visual-fix/);
  assert.match(html, /mel-bg-classic-hd-scaled\.jpg/);
  assert.match(html, /mel-bg-granada-hd-scaled\.jpg/);
  assert.match(html, /mel-normal-page-cleanup/);
  assert.match(html, /melOwnerPreviousMessage/);
  assert.match(html, /Message précédent/);
  assert.match(html, /\/api\/mel\/conversations\/latest/);
  assert.match(html, /document\.getElementById\('melTitle'\)\?\.remove\(\)/);
  assert.match(html, /mel-recall-last/);
  assert.doesNotMatch(html, /mel-owner-contrast-fix/);
  assert.doesNotMatch(html, /html body,html body \*\{color:#000!important/);
  assert.doesNotMatch(html, /mel-remove-recall-button/);
});

test('full mode receives the generated MEL portrait inline and explanatory live status patch', async () => {
  const input = new Response('<!doctype html><html><head></head><body><img src="/meliturgos-avatar-fille.png"><div id="melLiveLog"><div class="mel-live-entry">WAITING_TEACHER</div></div></body></html>', {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
  const output = await enhanceOwnerInterface(input, '/professor');
  const html = await output.text();
  assert.match(html, /data:image\/webp;base64,/);
  assert.match(html, /mel-full-avatar-fix/);
  assert.match(html, /mel-full-page-cleanup/);
  assert.match(html, /MEL a préparé la demande/);
});

test('non-owner API responses are left untouched', async () => {
  const input = new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
  const output = await enhanceOwnerInterface(input, '/api/health');
  assert.equal(await output.text(), '{"ok":true}');
});

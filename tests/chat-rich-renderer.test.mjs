import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { CHAT_RICH_RENDERER_SOURCE, CHAT_RICH_RENDERER_CSS } from '../src/pages/chat-rich-renderer.js';
import { NORMAL_RUNTIME_SOURCE } from '../src/pages/mvp-runtime.js';
import { FULL_MODE_CONTROL_PATCH } from '../src/pages/full-mode-control-enhancer.js';
import { onRequestGet as normalPage } from '../src/pages/mvp-interface-v3.js';

function render(markdown) {
  const dom = new JSDOM('<!doctype html><div id="host"></div>', {
    url: 'https://mel.example/',
    runScripts: 'outside-only',
  });
  dom.window.eval(CHAT_RICH_RENDERER_SOURCE);
  const host = dom.window.document.getElementById('host');
  const ok = dom.window.melRenderRichText(host, markdown);
  return { dom, host, ok };
}

test('rich renderer creates headings, inline emphasis, lists, quotes, tables and code blocks', () => {
  const fence = String.fromCharCode(96).repeat(3);
  const markdown = [
    '# État du projet',
    '',
    '**Infrastructure** et *présentation* avec '+String.fromCharCode(96)+'code'+String.fromCharCode(96)+'.',
    '',
    '- Cloudflare : opérationnel',
    '- GitHub : opérationnel',
    '',
    '> Preuve vérifiée.',
    '',
    '| Élément | État |',
    '| --- | --- |',
    '| Council | OK |',
    '',
    fence+'js',
    'const answer = 42;',
    fence,
  ].join('\n');

  const { host, ok } = render(markdown);
  assert.equal(ok, true);
  assert.equal(host.querySelector('h1')?.textContent, 'État du projet');
  assert.equal(host.querySelector('strong')?.textContent, 'Infrastructure');
  assert.equal(host.querySelector('em')?.textContent, 'présentation');
  assert.equal(host.querySelector('ul')?.children.length, 2);
  assert.match(host.querySelector('blockquote')?.textContent || '', /Preuve vérifiée/);
  assert.equal(host.querySelectorAll('table th').length, 2);
  assert.equal(host.querySelector('table td')?.textContent, 'Council');
  assert.match(host.querySelector('pre code')?.textContent || '', /answer = 42/);
  assert.equal(host.dataset.richRendered, 'true');
});

test('rich renderer preserves technical identifiers containing underscores', () => {
  const { host } = render('RELEASE_CODE_SMOKE_OK et *italique*');
  assert.match(host.textContent, /RELEASE_CODE_SMOKE_OK/);
  assert.equal(host.querySelector('em')?.textContent, 'italique');
});

test('rich renderer keeps raw HTML inert and refuses unsafe link schemes', () => {
  const payload = [
    '<img src=x onerror="window.pwned=true">',
    '',
    '[lien sûr](https://example.com/path)',
    '',
    '[dangereux](javascript:alert(1))',
  ].join('\n');
  const { dom, host } = render(payload);
  assert.equal(host.querySelector('img'), null);
  assert.equal(dom.window.pwned, undefined);
  const links = [...host.querySelectorAll('a')];
  assert.equal(links.length, 1);
  assert.equal(links[0].protocol, 'https:');
  assert.equal(links[0].rel, 'noopener noreferrer');
  assert.match(host.textContent, /<img src=x/);
  assert.match(host.textContent, /javascript:alert/);
});

test('normal chat runtime renders only MEL messages as rich text', () => {
  assert.match(NORMAL_RUNTIME_SOURCE, /window\.melRenderRichText=renderRichText/);
  assert.match(NORMAL_RUNTIME_SOURCE, /role==='user'\|\|typeof melRenderRichText!=='function'/);
  assert.match(NORMAL_RUNTIME_SOURCE, /else melRenderRichText\(c,String\(text\?\?''\)\)/);
});

test('full mode enhancer richifies current and future MEL bubbles', () => {
  assert.match(FULL_MODE_CONTROL_PATCH, /window\.melRenderRichText=renderRichText/);
  assert.match(FULL_MODE_CONTROL_PATCH, /MutationObserver/);
  assert.match(FULL_MODE_CONTROL_PATCH, /#chatlog \.msg\.mel:not\(\[data-rich-rendered="true"\]\)/);
  assert.match(FULL_MODE_CONTROL_PATCH, /installRichChatRendering\(\)/);
});

test('normal page ships shared rich response styles', async () => {
  const response = await normalPage();
  const html = await response.text();
  assert.match(CHAT_RICH_RENDERER_CSS, /mel-rich-table-wrap/);
  assert.match(html, /\.mel-rich-table-wrap/);
  assert.match(html, /\.msg\.mel\{white-space:normal\}/);
});

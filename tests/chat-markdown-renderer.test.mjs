import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { CHAT_MARKDOWN_RUNTIME_SOURCE } from '../src/pages/chat-markdown-runtime.js';
import { NORMAL_RUNTIME_SOURCE } from '../src/pages/mvp-runtime.js';
import { onRequestGet as renderFullInterface } from '../src/pages/full-interface-v2.js';

function render(markdown){
  const dom=new JSDOM('<!doctype html><div id="target"></div>',{runScripts:'outside-only',url:'https://mel.test/'});
  dom.window.eval(CHAT_MARKDOWN_RUNTIME_SOURCE);
  const target=dom.window.document.getElementById('target');
  dom.window.melRenderMarkdown(target,markdown);
  return {dom,target};
}

test('safe chat Markdown renderer formats headings lists tables code and emphasis',()=>{
  const {target}=render([
    '# Tableau de bord',
    '',
    '**Statut** clair.',
    '',
    '- Premier point',
    '- Deuxième point',
    '',
    '| Élément | État |',
    '| --- | --- |',
    '| GitHub | OK |',
    '',
    '> Note importante',
    '',
    '~~~'.replace(/~/g,'\u0060'),
    'const ok = true;',
    '~~~'.replace(/~/g,'\u0060'),
  ].join('\n'));

  assert.equal(target.querySelector('h2')?.textContent,'Tableau de bord');
  assert.equal(target.querySelector('strong')?.textContent,'Statut');
  assert.equal(target.querySelectorAll('ul li').length,2);
  assert.equal(target.querySelectorAll('table tbody tr').length,1);
  assert.equal(target.querySelector('blockquote')?.textContent.trim(),'Note importante');
  assert.match(target.querySelector('pre code')?.textContent||'',/const ok = true/);
});

test('safe renderer never creates executable HTML from model text',()=>{
  const {target}=render('<script>window.evil=1</script>\n\n<img src=x onerror=alert(1)>\n\n[ok](https://example.com)');
  assert.equal(target.querySelector('script'),null);
  assert.equal(target.querySelector('img'),null);
  assert.match(target.textContent,/window\.evil=1/);
  const link=target.querySelector('a');
  assert.equal(link?.href,'https://example.com/');
  assert.equal(link?.rel,'noopener noreferrer');
});

test('normal and full chat both route MEL replies through the shared safe Markdown renderer',async()=>{
  assert.match(NORMAL_RUNTIME_SOURCE,/melRenderMarkdown/);
  assert.doesNotMatch(CHAT_MARKDOWN_RUNTIME_SOURCE,/innerHTML\s*=/);
  const response=await renderFullInterface();
  const html=await response.text();
  assert.match(html,/window\.melRenderMarkdown/);
  assert.match(html,/typeof window\.melRenderMarkdown/);
  assert.match(html,/\.msg\.mel\.md-content/);
});

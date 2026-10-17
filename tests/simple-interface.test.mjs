import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8');

test('MEL opens on the conversation', () => {
  assert.match(source, /show\(initialView&&titles\[initialView\]\?initialView:'chat'\)/);
});

test('the menu shows the essentials; the rest is folded under « Plus »', () => {
  const nav = source.slice(source.indexOf('<nav class="nav" id="nav">'), source.indexOf('</nav>'));
  const folded = nav.indexOf('<details class="nav-more">');
  assert.ok(folded > 0);
  for (const essential of ['data-view="chat"', 'href="/revenus"', 'data-view="computer"', 'data-view="terminal"']) assert.ok(nav.indexOf(essential) < folded, essential);
  for (const advanced of ['data-view="overview"', 'data-view="skills"', 'data-view="roadmap"', 'data-view="lora"', 'data-view="diagnostics"']) assert.ok(nav.indexOf(advanced) > folded, advanced);
});

test('technical controls (MAX, cycle, pause…) are folded under « Avancé »', () => {
  assert.match(source, /<details class="advanced-controls"><summary>Avancé<\/summary><div class="canonical-autonomy-controls"/);
});

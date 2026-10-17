import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8');

test('MEL opens on the conversation', () => {
  assert.match(source, /show\(initialView&&titles\[initialView\]\?initialView:'chat'\)/);
});

test('desktop navigation exposes every MEL destination without a nested More group', () => {
  const start = source.indexOf('<nav class="nav" id="nav">');
  const end = source.indexOf('</nav>', start);
  assert.ok(start >= 0 && end > start);
  const nav = source.slice(start, end);
  assert.doesNotMatch(nav, /<details class="nav-more">/);
  const destinations = [
    'data-view="overview"', 'data-view="chat"', 'data-view="skills"',
    'data-view="roadmap"', 'data-view="multi"', 'data-view="memory"',
    'data-view="computer"', 'href="/revenus"', 'data-view="terminal"',
    'data-view="lora"', 'data-view="connections"', 'data-view="diagnostics"'
  ];
  let previous = -1;
  for (const destination of destinations) {
    const position = nav.indexOf(destination);
    assert.ok(position > previous, 'missing or misordered desktop destination: ' + destination);
    previous = position;
  }
  assert.match(nav, /<a class="nav-entry" href="\/revenus">/);
  assert.match(nav, /id="mobileMoreNav"/, 'small-screen More control remains');
  assert.match(source, /\.nav \.nav-entry\{appearance:none;[^}]*text-decoration:none/);
  assert.match(source, /\.nav button\.mobile-more-nav,\.mobile-more-menu\{display:none\}/);
});

test('technical controls (MAX, cycle, pause…) are folded under « Avancé »', () => {
  assert.match(source, /<details class="advanced-controls"><summary>Avancé<\/summary><div class="canonical-autonomy-controls"/);
});

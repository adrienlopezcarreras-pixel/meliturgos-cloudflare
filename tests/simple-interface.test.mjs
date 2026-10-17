import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8');

test('MEL opens on the conversation', () => {
  assert.match(source, /show\(initialView&&titles\[initialView\]\?initialView:'chat'\)/);
});

test('technical controls (MAX, cycle, pause…) are folded under « Avancé »', () => {
  assert.match(source, /<details class="advanced-controls"><summary>Avancé<\/summary><div class="canonical-autonomy-controls"/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequestGet } from '../src/pages/full-interface-v5.js';

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

test('full mode exposes one canonical IA salon and one composer', async () => {
  const html = await (await onRequestGet({})).text();
  assert.equal(occurrences(html, 'id="chatLog"'), 1);
  assert.equal(occurrences(html, 'id="chatInput"'), 1);
  assert.equal(occurrences(html, 'id="chatSend"'), 1);
  assert.equal(occurrences(html, 'id="chatTarget"'), 1);
  assert.match(html, /Salon IA/);
  assert.match(html, /Conseil Multi-IA/);
  assert.match(html, /resize:vertical/);
  assert.match(html, /mel\.full\.panel\.v5/);
});

test('canonical Mentor uses the guarded zero-euro endpoint and status route', async () => {
  const source = await readFile(new URL('../src/pages/full-interface-v5.js', import.meta.url), 'utf8');
  assert.match(source, /\/api\/gen2\/mentor\/chat/);
  assert.match(source, /\/api\/gen2\/mentor\/status/);
  assert.match(source, /zero-euro/);
  assert.match(source, /Promise\.allSettled/);
  assert.doesNotMatch(source, /Mentor · OpenAI/);
});

test('v5 is self-contained and does not stack older full-mode wrappers', async () => {
  const source = await readFile(new URL('../src/pages/full-interface-v5.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /control-room\.js/);
  assert.doesNotMatch(source, /full-interface-v[234]\.js/);
  assert.match(source, /FULL_MODE_HTML/);
});

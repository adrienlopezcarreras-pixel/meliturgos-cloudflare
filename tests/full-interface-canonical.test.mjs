import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequestGet } from '../src/pages/full-interface-v5.js';

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

test('full mode exposes exactly one canonical visible discussion room', async () => {
  const response = await onRequestGet({});
  const html = await response.text();
  assert.equal(occurrences(html, 'id="mentorRoomCanonical"'), 1);
  assert.equal(occurrences(html, 'id="mentorRoomLogCanonical"'), 1);
  assert.equal(occurrences(html, 'id="mentorRoomInputCanonical"'), 1);
  assert.equal(occurrences(html, 'id="melCanonicalStatus"'), 1);
  assert.match(html, /Statut MEL/);
  assert.match(html, /Prochaine tâche/);
  assert.match(html, /resize:vertical/);
  assert.match(html, /mel\.full\.last\.panel\.v2/);
});

test('canonical Mentor uses the guarded zero-euro endpoint', async () => {
  const source = await readFile(new URL('../src/pages/full-interface-v5.js', import.meta.url), 'utf8');
  assert.match(source, /\/api\/gen2\/mentor\/chat/);
  assert.match(source, /fail-closed/);
  assert.match(source, /0 € ajouté/);
  assert.doesNotMatch(source, /askFreeMentor[\s\S]{0,1800}\/api\/gen2\/augmentio\/fanout/);
  assert.doesNotMatch(source, /Mentor · OpenAI/);
});

test('v5 is the canonical layer and does not depend on earlier full-interface wrappers', async () => {
  const source = await readFile(new URL('../src/pages/full-interface-v5.js', import.meta.url), 'utf8');
  assert.match(source, /control-room\.js/);
  assert.doesNotMatch(source, /full-interface-v[234]\.js/);
});

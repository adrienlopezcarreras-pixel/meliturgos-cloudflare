import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../src/pages/full-interface-v5.js';

test('full mode exposes one canonical visible discussion room', async () => {
  const response = await onRequestGet({});
  const html = await response.text();
  assert.match(html, /id="mentorRoomCanonical"/);
  assert.match(html, /id="mentorRoomLogCanonical"/);
  assert.match(html, /id="mentorRoomInputCanonical"/);
  assert.match(html, /id="melCanonicalStatus"/);
  assert.match(html, /Statut MEL/);
  assert.match(html, /Prochaine tâche/);
  assert.match(html, /resize:vertical/);
  assert.match(html, /mel\.full\.last\.panel\.v2/);
});

test('mentor in full mode is zero-euro and never calls the paid OpenAI bridge', async () => {
  const response = await onRequestGet({});
  const html = await response.text();
  assert.match(html, /\/api\/gen2\/augmentio\/fanout/);
  assert.match(html, /Zero-Euro Governor/);
  assert.doesNotMatch(html, /\/api\/gen2\/mentor\/chat/);
  assert.doesNotMatch(html, /Mentor · OpenAI/);
});

test('v5 is the canonical layer and does not depend on earlier full-interface wrappers', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../src/pages/full-interface-v5.js', import.meta.url), 'utf8'));
  assert.match(source, /control-room\.js/);
  assert.doesNotMatch(source, /full-interface-v[234]\.js/);
});

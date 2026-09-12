import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequestGet } from '../src/pages/full-interface-v5.js';

const sourceUrl = new URL('../src/pages/full-interface-v5.js', import.meta.url);

function count(text, needle) {
  return text.split(needle).length - 1;
}

test('full mode has no test-only render contract or legacy duplicate UI', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.doesNotMatch(source, /RENDER_CONTRACT|melFullRenderContract/);
  const html = await (await onRequestGet({})).text();
  assert.equal(count(html, 'id="mentorRoomCanonical"'), 1);
  assert.equal(count(html, 'id="melCanonicalStatus"'), 1);
  assert.equal(count(html, 'id="mentorRoomLogCanonical"'), 1);
  assert.doesNotMatch(html, /id="mentorRoomV4"|id="melStatusPanelV5"|id="melReaderToolsV5"/);
});

test('Mentor route is fail-closed and does not use the generic fanout from its canonical client', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  const start = source.indexOf('async function askFreeMentor');
  const end = source.indexOf('async function getWorkState', start);
  const mentorClient = source.slice(start, end);
  assert.match(mentorClient, /\/api\/gen2\/mentor\/chat/);
  assert.doesNotMatch(mentorClient, /augmentio\/fanout|openai/i);
  assert.match(source, /billing_policy/);
  assert.match(source, /external_inference_used/);
});

test('status inspection uses the inference-free Mentor status route', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  const start = source.indexOf('async function statusMel');
  const end = source.indexOf('async function mentorReview', start);
  const statusClient = source.slice(start, end);
  assert.match(statusClient, /\/api\/gen2\/mentor\/status/);
  assert.doesNotMatch(statusClient, /askFreeMentor|mentor\/chat/);
});

test('full-mode wrapper stays compact and keeps advanced controls available', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(source.length < 22000, `full-interface-v5.js is too large: ${source.length} bytes`);
  assert.match(source, /Dernière réponse/);
  assert.match(source, /Grande lecture/);
  assert.match(source, /Prochaine tâche/);
  assert.match(source, /Teacher autonome/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8');

test('MEL chat sends verified image descriptions and audio transcripts with provenance', () => {
  const start = ui.indexOf('async function executeChatTurn(');
  const end = ui.indexOf('const pendingChatFiles=[]', start);
  assert.ok(start >= 0 && end > start);
  const turn = ui.slice(start, end);
  assert.match(turn, /Description visuelle réellement produite par le serveur/);
  assert.match(turn, /Transcription audio réellement produite par le serveur/);
  assert.match(turn, /item\.analysis_status/);
  assert.match(turn, /item\.preview/);
});

test('unprocessed photos, videos and audio stay explicitly unverified', () => {
  const turn = ui.slice(ui.indexOf('async function executeChatTurn('), ui.indexOf('const pendingChatFiles=[]'));
  assert.match(turn, /contenu visuel NON ANALYSÉ/);
  assert.match(turn, /contenu visuel et sonore NON ANALYSÉ/);
  assert.match(turn, /contenu sonore NON TRANSCRIT/);
});

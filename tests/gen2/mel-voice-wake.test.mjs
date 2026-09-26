import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  MEL_WAKE_PHRASES,
  WAKE_WORD_RUNTIME_SOURCE,
  detectWakePhrase,
  normalizeWakeText,
} from '../../src/pages/wake-word-runtime.js';

test('MEL-VOICE-01 normalizes French wake phrases locally', () => {
  assert.equal(normalizeWakeText('  Allô, MEL !  '), 'allo mel');
  assert.equal(normalizeWakeText('BONJOUR Mél'), 'bonjour mel');
  assert.deepEqual(MEL_WAKE_PHRASES, ['bonjour mel','allo mel']);
});

test('MEL-VOICE-01 detects exact wake phrases and optional inline commands', () => {
  assert.deepEqual(detectWakePhrase('Bonjour MEL'), {matched:true,phrase:'bonjour mel',command:''});
  assert.deepEqual(detectWakePhrase('Allô MEL quelle heure est-il ?'), {
    matched:true,
    phrase:'allo mel',
    command:'quelle heure est-il',
  });
  assert.deepEqual(detectWakePhrase('bonjour tout le monde'), {matched:false,phrase:null,command:''});
});

test('MEL-VOICE-01 wake runtime only auto-starts after an already granted microphone permission', () => {
  assert.match(WAKE_WORD_RUNTIME_SOURCE,/navigator\.permissions\?\.query/);
  assert.match(WAKE_WORD_RUNTIME_SOURCE,/permission\?\.state!=='granted'/);
  assert.doesNotMatch(WAKE_WORD_RUNTIME_SOURCE,/getUserMedia/);
  assert.doesNotMatch(WAKE_WORD_RUNTIME_SOURCE,/fetch\(/);
});

test('MEL-VOICE-01 wake listening is local, bounded and visibility-aware', () => {
  assert.match(WAKE_WORD_RUNTIME_SOURCE,/Date\.now\(\)\+8000/);
  assert.match(WAKE_WORD_RUNTIME_SOURCE,/document\.visibilityState==='hidden'/);
  assert.match(WAKE_WORD_RUNTIME_SOURCE,/voice-wake-word/);
  assert.match(WAKE_WORD_RUNTIME_SOURCE,/melWakeRestartTimer=setTimeout/);
  assert.match(WAKE_WORD_RUNTIME_SOURCE,/700/);
});

test('normal runtime appends wake runtime and pauses it during manual speech recognition', async () => {
  const source=await readFile(new URL('../../src/pages/mvp-runtime.js',import.meta.url),'utf8');
  assert.match(source,/WAKE_WORD_RUNTIME_SOURCE/);
  assert.match(source,/window\.melPauseWakeWord\?\.\(\)/);
  assert.match(source,/window\.melResumeWakeWord/);
});

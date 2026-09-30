import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AVATAR_MOTION_SOURCE,
  MEL_AVATAR_MOTION_STATES,
} from '../src/pages/avatar-motion-runtime.js';
import { NORMAL_RUNTIME_SOURCE } from '../src/pages/mvp-runtime.js';
import { onRequestGet } from '../src/pages/mvp-interface-v3.js';

test('MEL-AVATAR-01 exposes explicit lightweight browser motion states', () => {
  assert.deepEqual(MEL_AVATAR_MOTION_STATES, [
    'idle',
    'listening',
    'thinking',
    'speaking',
    'error',
  ]);
  for (const state of MEL_AVATAR_MOTION_STATES) {
    assert.match(AVATAR_MOTION_SOURCE, new RegExp("'" + state + "'"));
  }
  assert.match(AVATAR_MOTION_SOURCE, /window\.melAvatarMotion/);
  assert.match(AVATAR_MOTION_SOURCE, /mel-avatar-statechange/);
});

test('MEL-AVATAR-01 avoids blink loops and heavyweight animation runtimes', () => {
  assert.doesNotMatch(AVATAR_MOTION_SOURCE, /blink|eyelid|paupi[eè]re/i);
  assert.doesNotMatch(AVATAR_MOTION_SOURCE, /setInterval\s*\(/);
  assert.doesNotMatch(AVATAR_MOTION_SOURCE, /requestAnimationFrame\s*\(/);
  assert.doesNotMatch(AVATAR_MOTION_SOURCE, /canvas|getContext\s*\(/);
});

test('MEL-AVATAR-01 chat and voice runtime drive avatar states', () => {
  assert.match(NORMAL_RUNTIME_SOURCE, /melSetAvatarState\('idle','runtime-ready'\)/);
  assert.match(NORMAL_RUNTIME_SOURCE, /melSetAvatarState\('thinking','chat-request'\)/);
  assert.match(NORMAL_RUNTIME_SOURCE, /melSetAvatarState\('idle','chat-complete'\)/);
  assert.match(NORMAL_RUNTIME_SOURCE, /active\?'listening':failed\?'error':'idle'/);
  assert.match(NORMAL_RUNTIME_SOURCE, /melSetAvatarState\('thinking','voice-transcription'\)/);
  assert.doesNotMatch(NORMAL_RUNTIME_SOURCE, /avatar\.classList\.add\('thinking'\)/);
});

test('MEL-AVATAR-01 page has idle initial state, state CSS and reduced-motion fallback', async () => {
  const response = await onRequestGet();
  const html = await response.text();

  assert.match(html, /id="melAvatar" class="avatar" data-motion-state="idle"/);
  for (const state of MEL_AVATAR_MOTION_STATES) {
    assert.match(html, new RegExp('data-motion-state="' + state + '"'));
  }
  assert.match(html, /@keyframes melAvatarIdle/);
  assert.match(html, /@keyframes melAvatarListening/);
  assert.match(html, /@keyframes melAvatarThinking/);
  assert.match(html, /@keyframes melAvatarSpeaking/);
  assert.match(html, /@keyframes melAvatarError/);
  assert.match(html, /prefers-reduced-motion:reduce/);
  assert.match(html, /\/normal-runtime\.js\?v=8/);
});

test('MEL-AVATAR-01 does not alter the avatar image crop contract', async () => {
  const html = await (await onRequestGet()).text();
  assert.match(html, /object-fit:cover/);
  assert.match(html, /object-position:var\(--avatar-pos\)/);
  assert.match(html, /transform:none/);
  assert.match(html, /clip-path:circle\(50%\)/);
});

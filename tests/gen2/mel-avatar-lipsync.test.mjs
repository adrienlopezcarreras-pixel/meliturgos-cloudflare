import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../../src/pages/mvp-interface-v3.js';
import {
  AVATAR_LIPSYNC_SOURCE,
  MEL_LIPSYNC_LEVELS,
  MEL_LIPSYNC_SCHEMA,
  normalizeLipSyncLevel,
} from '../../src/pages/avatar-lipsync-runtime.js';
import { AVATAR_MOTION_SOURCE } from '../../src/pages/avatar-motion-runtime.js';

test('MEL-AVATAR-02 exposes bounded lip-sync levels and provider-neutral schema', () => {
  assert.equal(MEL_LIPSYNC_SCHEMA,'mel.avatar-lipsync.v1');
  assert.deepEqual(MEL_LIPSYNC_LEVELS,[0,1,2,3]);
  assert.equal(normalizeLipSyncLevel(-4),0);
  assert.equal(normalizeLipSyncLevel(1.6),2);
  assert.equal(normalizeLipSyncLevel(99),3);
});

test('MEL-AVATAR-02 runtime supports interchangeable provider and explicit zero-cost fallback', () => {
  assert.match(AVATAR_LIPSYNC_SOURCE,/attachProvider/);
  assert.match(AVATAR_LIPSYNC_SOURCE,/melLipSyncProvider\.start/);
  assert.match(AVATAR_LIPSYNC_SOURCE,/onLevel:value=>melSetLipSyncLevel/);
  assert.match(AVATAR_LIPSYNC_SOURCE,/zero-cost-fallback/);
  assert.match(AVATAR_LIPSYNC_SOURCE,/setTimeout\(tick,95\)/);
  assert.doesNotMatch(AVATAR_LIPSYNC_SOURCE,/requestAnimationFrame\s*\(/);
  assert.doesNotMatch(AVATAR_LIPSYNC_SOURCE,/setInterval\s*\(/);
  assert.doesNotMatch(AVATAR_LIPSYNC_SOURCE,/fetch\s*\(/);
});

test('MEL-AVATAR-02 lip-sync follows speaking state and stops outside speaking', () => {
  assert.match(AVATAR_LIPSYNC_SOURCE,/state==='speaking'.*melStartLipSync/s);
  assert.match(AVATAR_LIPSYNC_SOURCE,/else melStopLipSync/);
  assert.match(AVATAR_LIPSYNC_SOURCE,/melSetLipSyncLevel\(0,'stopped'\)/);
  assert.match(AVATAR_MOTION_SOURCE,/AVATAR_LIPSYNC_SOURCE/);
});

test('MEL-AVATAR-02 normal UI exposes lip-sync level without altering image crop contract', async () => {
  const html=await (await onRequestGet()).text();
  assert.match(html,/data-lipsync-level="0"/);
  assert.match(html,/data-lipsync-level="1"/);
  assert.match(html,/data-lipsync-level="2"/);
  assert.match(html,/data-lipsync-level="3"/);
  assert.match(html,/\.avatar::after/);
  assert.match(html,/object-fit:cover/);
  assert.match(html,/object-position:var\(--avatar-pos\)/);
  assert.match(html,/\.avatar img[^}]*transform:none/);
  assert.match(html,/prefers-reduced-motion:reduce/);
});

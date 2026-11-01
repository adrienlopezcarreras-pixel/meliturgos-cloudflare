import test from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_RUNTIME_SCHEMA, IMAGE_ACTIONS, createImageVisionRuntime } from '../src/media/image-vision-runtime.js';
import { VIDEO_RUNTIME_SCHEMA, VIDEO_ACTIONS, VideoRuntime } from '../src/media/video-runtime.js';

// Regression seed for MEL-CHAT-03: the media runtimes must be loaded by the
// contract's tests; MAX extends this file with the behavior it delivers.
test('image and video runtimes declare their schema and bounded actions', () => {
  assert.equal(IMAGE_RUNTIME_SCHEMA, 'mel.image-runtime/v1');
  assert.equal(VIDEO_RUNTIME_SCHEMA, 'mel.video-runtime/v1');
  assert.deepEqual([...IMAGE_ACTIONS], ['ANALYZE', 'PROCESS', 'GENERATE']);
  assert.deepEqual([...VIDEO_ACTIONS], ['ANALYZE', 'PROCESS', 'GENERATE']);
  assert.equal(typeof createImageVisionRuntime, 'function');
  assert.equal(typeof VideoRuntime, 'function');
});

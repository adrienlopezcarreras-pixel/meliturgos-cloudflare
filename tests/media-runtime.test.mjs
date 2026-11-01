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

// MEL-CHAT-03: a thumbnail or a URL is not a complete analysis; without a
// transcript the vision stays partial with its exact scope and error.
test('video analysis coverage separates reference-only, partial vision and full understanding', async () => {
  const { videoAnalysisCoverage, createVideoRuntime } = await import('../src/media/video-runtime.js');
  assert.deepEqual({ ...videoAnalysisCoverage({ input_kind: 'thumbnail' }) }, { scope: 'REFERENCE_ONLY', complete: false, input_kind: 'thumbnail', error: 'VIDEO_THUMBNAIL_ONLY' });
  assert.equal(videoAnalysisCoverage({ input_kind: 'url' }).error, 'VIDEO_BYTES_NOT_READ');
  assert.equal(videoAnalysisCoverage({ input_kind: 'bytes' }).scope, 'REFERENCE_ONLY', 'bytes must be proven read');
  const partial = videoAnalysisCoverage({ input_kind: 'bytes', bytes_read: true, transcript_error: 'ASR_TIMEOUT' });
  assert.deepEqual([partial.scope, partial.complete, partial.error, [...partial.covered]], ['PARTIAL', false, 'ASR_TIMEOUT', ['vision']]);
  assert.equal(videoAnalysisCoverage({ input_kind: 'bytes', bytes_read: true }).error, 'VIDEO_TRANSCRIPT_MISSING');
  const full = videoAnalysisCoverage({ input_kind: 'bytes', bytes_read: true, transcript: 'Bonjour' });
  assert.deepEqual([full.scope, full.complete, full.error], ['FULL', true, null]);
  assert.equal(typeof createVideoRuntime, 'function');
});

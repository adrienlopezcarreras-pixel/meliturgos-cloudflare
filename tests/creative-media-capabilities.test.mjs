import test from 'node:test';
import assert from 'node:assert/strict';

import { methods as audioMethods } from '../src/media/audio.js';
import { methods as imageMethods } from '../src/media/images.js';
import { methods as videoMethods } from '../src/media/video.js';
import { MediaGenerationService } from '../src/media/media-generation-service.js';

test('creative media ports expose understanding and production surfaces', () => {
  assert.deepEqual(audioMethods, ['transcribe', 'synthesize', 'analyze', 'generate']);
  assert.deepEqual(imageMethods, ['analyze', 'process', 'generate']);
  assert.deepEqual(videoMethods, ['analyze', 'process', 'generate']);
  assert.ok(MediaGenerationService.kinds.includes('music'));
});

test('music generation remains truthful and fail-closed without a provider', async () => {
  const service = new MediaGenerationService();
  const job = await service.generate({ kind: 'music', prompt: 'test' });
  assert.equal(job.status, 'unavailable');
  assert.match(job.error, /provider/i);
});

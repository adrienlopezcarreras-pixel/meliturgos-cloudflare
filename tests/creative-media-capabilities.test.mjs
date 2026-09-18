import test from 'node:test';
import assert from 'node:assert/strict';

import { methods as audioMethods } from '../src/media/audio.js';
import { methods as imageMethods } from '../src/media/images.js';
import { methods as videoMethods } from '../src/media/video.js';
import { MediaGenerationService } from '../src/media/media-generation-service.js';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';

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


test('creative media capabilities are canonical bus entries and block duplicate gap proposals when providers are absent', async () => {
  const runtime = createGen2Runtime({ env: {} });
  const ids = runtime.bus.list().filter(row => row.category === 'creative-media').map(row => row.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['media.image.analyze','media.image.generate','media.audio.analyze','media.music.analyze','media.music.generate','media.video.analyze','media.video.generate']) {
    assert.ok(ids.includes(id), id);
  }
  const result = await runtime.bus.execute(
    'evolution.gap.detect',
    { goal: 'image.generate', threshold: 1 },
    { owner: 'test', permissions: [], requestId: 'creative-gap' },
  );
  assert.equal(result.classification, 'MATCHED_BUT_BLOCKED');
  assert.equal(result.best_match.id, 'media.image.generate');
});

test('creative media capability executes a real injected adapter and reports healthy', async () => {
  const runtime = createGen2Runtime({
    env: {
      MEL_MEDIA_CAPABILITIES: {
        'media.music.analyze': async input => ({ ok: true, analysis: String(input.title || '') }),
      },
    },
  });
  const row = runtime.bus.describe('media.music.analyze');
  assert.equal(row.health, 'HEALTHY');
  const output = await runtime.bus.execute(
    'media.music.analyze',
    { title: 'fugue' },
    { owner: 'test', permissions: [], requestId: 'music-analyze' },
  );
  assert.deepEqual(output, { ok: true, analysis: 'fugue' });
});

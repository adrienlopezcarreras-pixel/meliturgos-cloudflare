import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WORKERS_AI_TRANSCRIPTION_MODEL,
  WORKERS_AI_VISION_MODEL,
  createWorkersAiZeroCostMediaCapabilities,
} from '../src/media/workers-ai-media-capabilities.js';
import {
  WORKERS_AI_ZERO_COST_PROOF_SCHEMA,
  WORKERS_AI_ZERO_COST_PRICING_POLICY,
} from '../src/augmentio/workers-ai-zero-cost-proof.js';
import {
  MEDIA_TRANSFORM_ZERO_COST_PROOF_SCHEMA,
} from '../src/media/media-transform-zero-cost-proof.js';

function keyB64() {
  return Buffer.from(Uint8Array.from({ length: 32 }, (_, i) => i + 31)).toString('base64');
}

function workersProof(models, now = Date.now()) {
  return JSON.stringify({
    schema: WORKERS_AI_ZERO_COST_PROOF_SCHEMA,
    provider: 'workers-ai',
    account_plan: 'WORKERS_FREE',
    billing_path: 'direct-workers-ai-binding',
    pricing_policy: WORKERS_AI_ZERO_COST_PRICING_POLICY,
    free_allocation_neurons_per_day: 10000,
    free_overage_behavior: 'FAIL_NOT_BILL',
    plan_evidence: {
      source: 'cloudflare-account-entitlements-api',
      account_type: 'standard',
      entitlement_key: 'workers.static_assets.manifest_limit_file_count',
      entitlement_value: 20000,
      workers_free_reference_value: 20000,
    },
    models,
    verified_at: new Date(now - 5_000).toISOString(),
    expires_at: new Date(now + 30 * 60_000).toISOString(),
  });
}

function transformProof(now = Date.now()) {
  return JSON.stringify({
    schema: MEDIA_TRANSFORM_ZERO_COST_PROOF_SCHEMA,
    provider: 'cloudflare-media-transformations',
    binding: 'MEDIA',
    source: 'cloudflare-official-bindings-doc',
    billing_status: 'OPEN_BETA_NOT_BILLED',
    documentation_url: 'https://developers.cloudflare.com/stream/transform-videos/bindings/',
    verified_at: new Date(now - 5_000).toISOString(),
    expires_at: new Date(now + 30 * 60_000).toISOString(),
  });
}

function fakeMedia(records) {
  return {
    input(stream) {
      assert.ok(stream);
      const state = { transform: null };
      return {
        transform(options) {
          state.transform = options;
          records.push({ stage: 'transform', options });
          return this;
        },
        output(options) {
          records.push({ stage: 'output', options, transform: state.transform });
          const mode = options.mode;
          return {
            async response() {
              if (mode === 'video') {
                return new Response(Uint8Array.from([0,0,0,24,102,116,121,112,9,8,7]), {
                  status: 200,
                  headers: { 'content-type': 'video/mp4' },
                });
              }
              if (mode === 'spritesheet') {
                return new Response(Uint8Array.from([255,216,255,224,1,2,3]), {
                  status: 200,
                  headers: { 'content-type': 'image/jpeg' },
                });
              }
              if (mode === 'audio') {
                return new Response(Uint8Array.from([0,0,0,20,102,116,121,112,4,5,6]), {
                  status: 200,
                  headers: { 'content-type': 'audio/mp4' },
                });
              }
              return new Response(null, { status: 400 });
            },
          };
        },
      };
    },
  };
}

function fixture({ workersModels = [], transform = true } = {}) {
  const records = [];
  const writes = [];
  let visionCalls = 0;
  const env = {
    MELITURGOS_USER: 'owner',
    MEL_MEDIA_ENCRYPTION_KEY_ID: 'video-key-test',
    MEL_MEDIA_ENCRYPTION_KEY_B64: keyB64(),
    MEL_WORKERS_AI_ZERO_COST_PROOF_JSON: workersProof(workersModels),
    MEL_MEDIA_TRANSFORM_ZERO_COST_PROOF_JSON: transform ? transformProof() : '',
    MEDIA_BUCKET: {
      async put(key, value, options) {
        writes.push({ key, value: new Uint8Array(value), options });
      },
    },
    MEDIA: fakeMedia(records),
    AI: {
      async run(model, input) {
        if (model === WORKERS_AI_TRANSCRIPTION_MODEL) {
          return { text: 'Bonjour dans la vidéo.', word_count: 4 };
        }
        if (model === WORKERS_AI_VISION_MODEL) {
          visionCalls += 1;
          if (input?.image) return { response: 'Storyboard: une personne parle face caméra.' };
          return { response: 'La vidéo montre une personne face caméra et la piste audio contient une salutation.' };
        }
        throw new Error('UNEXPECTED_MODEL:' + model);
      },
    },
  };
  return { env, records, writes, visionCalls: () => visionCalls };
}

test('video processing uses real Media Transformations binding and encrypted private storage', async () => {
  const f = fixture();
  const adapters = createWorkersAiZeroCostMediaCapabilities(f.env);
  assert.equal(typeof adapters['media.video.process'], 'function');

  const input = Uint8Array.from([0,0,0,24,102,116,121,112,1,2,3,4]);
  const result = await adapters['media.video.process']({
    bytes: input,
    width: 640,
    height: 360,
    duration_seconds: 8,
    audio: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.capability, 'media.video.process');
  assert.equal(result.provider, 'cloudflare-media-transformations');
  assert.equal(result.zero_added_cost, true);
  assert.equal(result.artifact.private, true);
  assert.equal(result.artifact.stored_encrypted, true);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].options.customMetadata.capability, 'media.video.process');
  assert.ok(f.records.some(row => row.stage === 'output' && row.options.mode === 'video'));
});

test('video analysis samples real frames and audio then combines Gemma Vision and Whisper evidence', async () => {
  const f = fixture({ workersModels: [WORKERS_AI_VISION_MODEL, WORKERS_AI_TRANSCRIPTION_MODEL] });
  const adapters = createWorkersAiZeroCostMediaCapabilities(f.env);
  assert.equal(typeof adapters['media.video.analyze'], 'function');

  const result = await adapters['media.video.analyze']({
    bytes: Uint8Array.from([0,0,0,24,102,116,121,112,10,20,30]),
    duration_seconds: 12,
    image_count: 5,
    language: 'fr',
  });

  assert.equal(result.ok, true);
  assert.equal(result.capability, 'media.video.analyze');
  assert.equal(result.provider, 'cloudflare-media-transformations+workers-ai');
  assert.equal(result.sampled_frame_count, 5);
  assert.equal(result.transcript, 'Bonjour dans la vidéo.');
  assert.equal(result.transcript_status, 'TRANSCRIBED');
  assert.match(result.visual_analysis, /face caméra/);
  assert.match(result.summary, /piste audio/);
  assert.equal(f.visionCalls(), 2);
  assert.ok(f.records.some(row => row.stage === 'output' && row.options.mode === 'spritesheet'));
  assert.ok(f.records.some(row => row.stage === 'output' && row.options.mode === 'audio'));
});

test('video capabilities disappear fail-closed when current no-billing proof is absent', () => {
  const f = fixture({
    workersModels: [WORKERS_AI_VISION_MODEL, WORKERS_AI_TRANSCRIPTION_MODEL],
    transform: false,
  });
  const adapters = createWorkersAiZeroCostMediaCapabilities(f.env);
  assert.equal(adapters['media.video.process'], undefined);
  assert.equal(adapters['media.video.analyze'], undefined);
});

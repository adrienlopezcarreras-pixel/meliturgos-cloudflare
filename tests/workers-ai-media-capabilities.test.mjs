import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_INLINE_TRANSCRIPTION_BYTES,
  WORKERS_AI_IMAGE_MODEL,
  WORKERS_AI_IMAGE_EDIT_MODEL,
  WORKERS_AI_VISION_MODEL,
  WORKERS_AI_TRANSCRIPTION_MODEL,
  WORKERS_AI_TTS_MODEL,
  createWorkersAiZeroCostMediaCapabilities,
  transcribeAudioBytes,
} from '../src/media/workers-ai-media-capabilities.js';
import {
  WORKERS_AI_ZERO_COST_PROOF_SCHEMA,
  WORKERS_AI_ZERO_COST_PRICING_POLICY,
} from '../src/augmentio/workers-ai-zero-cost-proof.js';
import { BROWSER_RUN_ZERO_COST_PROOF_SCHEMA } from '../src/media/browser-run-zero-cost-proof.js';

function mediaKeyB64() {
  return Buffer.from(Uint8Array.from({ length: 32 }, (_, i) => i + 11)).toString('base64');
}

function proof(models, now = Date.now()) {
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
    verified_at: new Date(now - 10_000).toISOString(),
    expires_at: new Date(now + 20 * 60_000).toISOString(),
  });
}
function browserProof(now = Date.now()) {
  return JSON.stringify({
    schema: BROWSER_RUN_ZERO_COST_PROOF_SCHEMA,
    provider: 'cloudflare-browser-run',
    account_plan: 'WORKERS_FREE',
    included_minutes_per_day: 10,
    overage_behavior: 'HARD_LIMIT_NO_BILLING',
    documentation_url: 'https://developers.cloudflare.com/browser-run/pricing/',
    verified_at: new Date(now - 5_000).toISOString(),
    expires_at: new Date(now + 20 * 60_000).toISOString(),
  });
}

function fixture({ proofJson, run, toMarkdown = null, browser = false } = {}) {
  const writes = [];
  let calls = 0;
  const env = {
    MELITURGOS_USER: 'owner',
    MEL_MEDIA_ENCRYPTION_KEY_ID: 'media-key-test',
    MEL_MEDIA_ENCRYPTION_KEY_B64: mediaKeyB64(),
    MEL_WORKERS_AI_ZERO_COST_PROOF_JSON: proofJson,
    ...(browser ? {
      MEL_BROWSER_RUN_ZERO_COST_PROOF_JSON: browserProof(),
      MEL_BROWSER_COMPANION: {
        async fetch(request) {
          const body = JSON.parse(await request.text());
          if (new URL(request.url).pathname !== '/v1/media/resize-image') {
            return Response.json({ ok: false, code: 'UNEXPECTED_BROWSER_ROUTE' }, { status: 404 });
          }
          return Response.json({
            ok: true,
            schema: 'mel.media.browser-resize-image.result/v1',
            base64: body.base64,
            mime: 'image/jpeg',
            width: 510,
            height: 510,
          });
        },
      },
    } : {}),
    MEDIA_BUCKET: {
      async put(key, value, options) {
        writes.push({ key, value: new Uint8Array(value), options });
      },
    },
    AI: {
      async run(model, input, options) {
        calls += 1;
        return run(model, input, options);
      },
      ...(typeof toMarkdown === 'function' ? { toMarkdown } : {}),
    },
  };
  return { env, writes, calls: () => calls };
}

test('Workers AI media adapters stay absent without a fresh exact-model zero-cost proof', async () => {
  const f = fixture({
    proofJson: '',
    run: async () => { throw new Error('AI_SHOULD_NOT_RUN'); },
  });
  const adapters = createWorkersAiZeroCostMediaCapabilities(f.env);
  assert.deepEqual(Object.keys(adapters), []);
  assert.equal(f.calls(), 0);

  const stale = {
    ...f.env,
    MEL_WORKERS_AI_ZERO_COST_PROOF_JSON: proof(
      [WORKERS_AI_IMAGE_MODEL, WORKERS_AI_TTS_MODEL],
      Date.now() - 2 * 60 * 60_000,
    ),
  };
  assert.deepEqual(Object.keys(createWorkersAiZeroCostMediaCapabilities(stale)), []);
  assert.equal(f.calls(), 0);
});

test('Gemma 4 vision performs real image analysis only with exact zero-cost proof', async () => {
  const png = Uint8Array.from([137,80,78,71,13,10,26,10,1,2,3,4]);
  const f = fixture({
    proofJson: proof([WORKERS_AI_VISION_MODEL]),
    run: async (model, input, options) => {
      assert.equal(model, WORKERS_AI_VISION_MODEL);
      assert.equal(input.messages[1].content[0].type, 'text');
      assert.equal(input.messages[1].content[0].text, 'Décris précisément.');
      assert.equal(input.messages[1].content[1].type, 'image_url');
      assert.match(input.messages[1].content[1].image_url.url, /^data:image\/png;base64,/);
      assert.deepEqual(options, { rejectIfBusy: true });
      return { response: 'Une image de test observable.' };
    },
  });
  const adapters = createWorkersAiZeroCostMediaCapabilities(f.env);
  assert.equal(typeof adapters['media.image.analyze'], 'function');
  const result = await adapters['media.image.analyze']({
    bytes: png,
    mime: 'image/png',
    prompt: 'Décris précisément.',
  });
  assert.equal(result.ok, true);
  assert.equal(result.capability, 'media.image.analyze');
  assert.equal(result.model, WORKERS_AI_VISION_MODEL);
  assert.equal(result.analysis, 'Une image de test observable.');
  assert.equal(result.source.size, png.byteLength);
  assert.match(result.source.sha256, /^[0-9a-f]{64}$/);
  assert.equal(f.writes.length, 0);
});

test('Gemma vision schema mismatch falls back to Workers AI toMarkdown without hiding the capability', async () => {
  const png = Uint8Array.from([137,80,78,71,13,10,26,10,5,6,7,8]);
  let markdownCalls = 0;
  const f = fixture({
    proofJson: proof([WORKERS_AI_VISION_MODEL]),
    run: async () => {
      const error = new Error("5006: Error: Additional or unevaluated properties '/max_tokens' at '/' not allowed");
      error.code = '5006';
      throw error;
    },
    toMarkdown: async (file, options) => {
      markdownCalls += 1;
      assert.equal(file.name, 'mel-image.png');
      assert.equal(file.blob.type, 'image/png');
      assert.equal(options.conversionOptions.image.descriptionLanguage, 'fr');
      assert.equal(options.conversionOptions.output.format, 'text');
      return [{ data: 'Un cercle bleu sur un fond ivoire.' }];
    },
  });
  const result = await createWorkersAiZeroCostMediaCapabilities(f.env)['media.image.analyze']({
    bytes: png,
    mime: 'image/png',
    prompt: 'Décris précisément.',
  });
  assert.equal(result.ok, true);
  assert.equal(result.analysis, 'Un cercle bleu sur un fond ivoire.');
  assert.equal(result.engine, 'workers-ai-tomarkdown-vision-fallback');
  assert.equal(f.calls(), 1);
  assert.equal(markdownCalls, 1);
});

test('FLUX.2 Klein performs real image editing and stores the result encrypted', async () => {
  const source = Uint8Array.from([137,80,78,71,13,10,26,10,7,8,9,10]);
  const output = Buffer.from('edited-image-private-test-bytes');
  const f = fixture({
    proofJson: proof([WORKERS_AI_IMAGE_EDIT_MODEL]),
    browser: true,
    run: async (model, input, options) => {
      assert.equal(model, WORKERS_AI_IMAGE_EDIT_MODEL);
      assert.ok(input?.multipart?.body);
      assert.match(String(input?.multipart?.contentType || ''), /^multipart\/form-data; boundary=/i);
      assert.deepEqual(options, { rejectIfBusy: true });
      return { image: output.toString('base64') };
    },
  });
  const adapters = createWorkersAiZeroCostMediaCapabilities(f.env);
  assert.equal(typeof adapters['media.image.process'], 'function');
  const result = await adapters['media.image.process']({
    bytes: source,
    mime: 'image/png',
    instruction: 'Rendre le fond plus sombre.',
    width: 1024,
    height: 768,
  });
  assert.equal(result.ok, true);
  assert.equal(result.capability, 'media.image.process');
  assert.equal(result.model, WORKERS_AI_IMAGE_EDIT_MODEL);
  assert.equal(result.reference_resize.width, 510);
  assert.equal(result.reference_resize.height, 510);
  assert.equal(result.artifact.private, true);
  assert.equal(result.artifact.stored_encrypted, true);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].options.customMetadata.capability, 'media.image.process');
  assert.notDeepEqual(Buffer.from(f.writes[0].value), output);
});

test('FLUX image generation is exact-model, zero-cost-gated and encrypted into private Media Vault storage', async () => {
  const jpeg = Buffer.from('not-a-real-jpeg-but-private-test-bytes');
  const f = fixture({
    proofJson: proof([WORKERS_AI_IMAGE_MODEL, WORKERS_AI_TTS_MODEL]),
    run: async (model, input) => {
      assert.equal(model, WORKERS_AI_IMAGE_MODEL);
      assert.equal(input.prompt, 'portrait techno');
      assert.equal(input.steps, 4);
      return { image: jpeg.toString('base64') };
    },
  });
  const adapters = createWorkersAiZeroCostMediaCapabilities(f.env);
  assert.equal(typeof adapters['media.image.generate'], 'function');

  const result = await adapters['media.image.generate']({ prompt: 'portrait techno' });
  assert.equal(result.ok, true);
  assert.equal(result.zero_added_cost, true);
  assert.equal(result.model, WORKERS_AI_IMAGE_MODEL);
  assert.equal(result.artifact.private, true);
  assert.equal(result.artifact.stored_encrypted, true);
  assert.equal(result.artifact.url, null);
  assert.equal(f.calls(), 1);
  assert.equal(f.writes.length, 1);
  assert.match(f.writes[0].key, /^generated\/\d{4}-\d{2}-\d{2}\//);
  assert.equal(f.writes[0].options.httpMetadata.contentType, 'application/octet-stream');
  assert.equal(f.writes[0].options.customMetadata.originalMime, 'image/jpeg');
  assert.notDeepEqual(Buffer.from(f.writes[0].value), jpeg);
});

test('Aura TTS uses raw Workers AI response and stores only encrypted private audio', async () => {
  const mp3 = Uint8Array.from([73, 68, 51, 4, 0, 0, 0, 0]);
  const f = fixture({
    proofJson: proof([WORKERS_AI_IMAGE_MODEL, WORKERS_AI_TTS_MODEL]),
    run: async (model, input, options) => {
      assert.equal(model, WORKERS_AI_TTS_MODEL);
      assert.equal(input.text, 'Bonjour MEL');
      assert.equal(input.encoding, 'mp3');
      assert.equal(input.speaker, 'luna');
      assert.deepEqual(options, { returnRawResponse: true });
      return new Response(mp3, { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    },
  });
  const adapters = createWorkersAiZeroCostMediaCapabilities(f.env);
  assert.equal(typeof adapters['media.audio.synthesize'], 'function');

  const result = await adapters['media.audio.synthesize']({ text: 'Bonjour MEL', voice: 'luna' });
  assert.equal(result.ok, true);
  assert.equal(result.model, WORKERS_AI_TTS_MODEL);
  assert.equal(result.artifact.mime, 'audio/mpeg');
  assert.equal(result.artifact.private, true);
  assert.equal(result.artifact.url, null);
  assert.equal(f.calls(), 1);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].options.customMetadata.originalMime, 'audio/mpeg');
  assert.notDeepEqual(f.writes[0].value, mp3);
});

test('Whisper transcription is exact-model and exposes bounded text only with fresh zero-cost proof', async () => {
  const audio = Uint8Array.from([82,73,70,70,1,2,3,4]);
  const f = fixture({
    proofJson: proof([WORKERS_AI_TRANSCRIPTION_MODEL]),
    run: async (model, input) => {
      assert.equal(model, WORKERS_AI_TRANSCRIPTION_MODEL);
      assert.deepEqual(Buffer.from(input.audio, 'base64'), Buffer.from(audio));
      assert.equal(input.task, 'transcribe');
      assert.equal(input.language, 'fr');
      assert.equal(input.vad_filter, true);
      return { text: 'Bonjour depuis MEL.', word_count: 3 };
    },
  });
  const adapters = createWorkersAiZeroCostMediaCapabilities(f.env);
  assert.equal(typeof adapters['media.audio.transcribe'], 'function');

  const result = await adapters['media.audio.transcribe']({
    audio_base64: Buffer.from(audio).toString('base64'),
    language: 'fr',
    vad_filter: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.zero_added_cost, true);
  assert.equal(result.model, WORKERS_AI_TRANSCRIPTION_MODEL);
  assert.equal(result.text, 'Bonjour depuis MEL.');
  assert.equal(result.word_count, 3);
  assert.equal(result.artifact, undefined);
  assert.equal(f.calls(), 1);
});

test('Whisper inline transcription fails before AI when audio requires chunking', async () => {
  const f = fixture({
    proofJson: proof([WORKERS_AI_TRANSCRIPTION_MODEL]),
    run: async () => { throw new Error('AI_SHOULD_NOT_RUN'); },
  });
  await assert.rejects(
    () => transcribeAudioBytes(f.env, new Uint8Array(MAX_INLINE_TRANSCRIPTION_BYTES + 1)),
    { code: 'AUDIO_TRANSCRIPTION_REQUIRES_CHUNKING', status: 413 },
  );
  assert.equal(f.calls(), 0);
});

import { workersAiRuntimeZeroCostProvenance } from '../augmentio/workers-ai-zero-cost-proof.js';
import { createEnvMediaVaultCodec } from './media-vault-crypto.js';

export const WORKERS_AI_IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
export const WORKERS_AI_TTS_MODEL = '@cf/deepgram/aura-1';
export const WORKERS_AI_TRANSCRIPTION_MODEL = '@cf/openai/whisper-large-v3-turbo';

const IMAGE_ADAPTER_ID = 'workers-ai.media.image.flux-1-schnell';
const TTS_ADAPTER_ID = 'workers-ai.media.audio.aura-1';
const TRANSCRIPTION_ADAPTER_ID = 'workers-ai.media.audio.whisper-large-v3-turbo';
const MAX_IMAGE_BYTES = 20_000_000;
const MAX_AUDIO_BYTES = 20_000_000;
export const MAX_INLINE_TRANSCRIPTION_BYTES = 8_000_000;
const DEFAULT_MEDIA_TTL_SECONDS = 7 * 24 * 60 * 60;
const AURA_SPEAKERS = new Set([
  'angus','asteria','arcas','orion','orpheus','athena','luna',
  'zeus','perseus','helios','hera','stella',
]);

function clean(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function mediaError(code, status = 503) {
  return Object.assign(new Error(code), { code, status });
}

function mediaTtlSeconds(env = {}) {
  const configured = Number(env.MEL_MEDIA_TTL_SECONDS);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_MEDIA_TTL_SECONDS;
  return Math.min(30 * 24 * 60 * 60, Math.max(60, Math.trunc(configured)));
}

function base64Bytes(value) {
  try {
    const binary = atob(String(value || ''));
    return Uint8Array.from(binary, ch => ch.charCodeAt(0));
  } catch {
    throw mediaError('WORKERS_AI_MEDIA_BASE64_INVALID', 502);
  }
}

function bytesBase64(bytesInput) {
  const bytes = bytesInput instanceof Uint8Array ? bytesInput : new Uint8Array(bytesInput || []);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.byteLength, offset + chunkSize)));
  }
  return btoa(binary);
}

function normalizeTranscriptionResult(value) {
  const text = clean(
    value?.text
      ?? value?.transcription_info?.text
      ?? value?.result?.text
      ?? value?.result?.transcription_info?.text,
    120_000,
  );
  const wordCount = Number(
    value?.word_count
      ?? value?.transcription_info?.word_count
      ?? value?.result?.word_count
      ?? value?.result?.transcription_info?.word_count,
  );
  return Object.freeze({
    text,
    word_count: Number.isFinite(wordCount) && wordCount >= 0 ? wordCount : null,
  });
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function freshZeroCostProof(env, adapterId, modelId) {
  return workersAiRuntimeZeroCostProvenance(env, { adapterId, modelId });
}

function mediaStorageReady(env = {}) {
  return Boolean(
    env.MEDIA_BUCKET
    && typeof env.MEDIA_BUCKET.put === 'function'
    && clean(env.MEL_MEDIA_ENCRYPTION_KEY_ID, 200)
    && clean(env.MEL_MEDIA_ENCRYPTION_KEY_B64, 1000),
  );
}

function adapterReady(env, adapterId, modelId) {
  return Boolean(env?.AI?.run && mediaStorageReady(env) && freshZeroCostProof(env, adapterId, modelId));
}

async function storePrivateArtifact(env, bytesInput, {
  capability,
  model,
  mime,
  extension,
} = {}) {
  const bytes = bytesInput instanceof Uint8Array ? bytesInput : new Uint8Array(bytesInput || []);
  if (!bytes.byteLength) throw mediaError('WORKERS_AI_MEDIA_OUTPUT_EMPTY', 502);
  const id = crypto.randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + mediaTtlSeconds(env) * 1000);
  const owner = clean(env.MELITURGOS_USER || 'owner', 200) || 'owner';
  const plaintextSha256 = await sha256Hex(bytes);
  const key = `generated/${createdAt.toISOString().slice(0,10)}/${id}.${clean(extension, 12) || 'bin'}.enc`;
  const codec = createEnvMediaVaultCodec(env);
  const aad = {
    schema: 'MEL_MEDIA_GENERATED_AAD_V1',
    id,
    owner,
    capability: clean(capability, 160),
    model: clean(model, 300),
    mime: clean(mime, 160),
    plaintext_sha256: plaintextSha256,
  };
  const sealed = await codec.seal(bytes, aad);
  await env.MEDIA_BUCKET.put(key, sealed.ciphertext, {
    httpMetadata: { contentType: 'application/octet-stream' },
    customMetadata: {
      generated: 'true',
      owner,
      capability: clean(capability, 160),
      model: clean(model, 300),
      originalMime: clean(mime, 160),
      sha256: plaintextSha256,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      ...sealed.metadata,
    },
  });
  return Object.freeze({
    id,
    key,
    url: null,
    private: true,
    stored: true,
    stored_encrypted: true,
    mime: clean(mime, 160),
    size: bytes.byteLength,
    sha256: plaintextSha256,
    created_at: createdAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    encryption: Object.freeze({
      schema: String(sealed.metadata.mediaSchema || ''),
      algorithm: String(sealed.metadata.mediaAlgorithm || ''),
      key_id: String(sealed.metadata.mediaKeyId || ''),
    }),
  });
}

async function imageGenerate(env, input = {}) {
  const provenance = freshZeroCostProof(env, IMAGE_ADAPTER_ID, WORKERS_AI_IMAGE_MODEL);
  if (!provenance) throw mediaError('WORKERS_AI_ZERO_COST_PROOF_REQUIRED');
  if (!env?.AI?.run) throw mediaError('AI_BINDING_MISSING');
  if (!mediaStorageReady(env)) throw mediaError('MEDIA_VAULT_UNAVAILABLE');

  const prompt = clean(input.prompt, 2048);
  if (!prompt) throw mediaError('MEDIA_PROMPT_REQUIRED', 400);
  const requestedSteps = Number(input?.params?.steps ?? input.steps ?? 4);
  const steps = Number.isFinite(requestedSteps)
    ? Math.min(8, Math.max(1, Math.trunc(requestedSteps)))
    : 4;

  const result = await env.AI.run(WORKERS_AI_IMAGE_MODEL, { prompt, steps });
  const encoded = clean(result?.image, 40_000_000);
  if (!encoded) throw mediaError('WORKERS_AI_IMAGE_OUTPUT_INVALID', 502);
  const bytes = base64Bytes(encoded);
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw mediaError('WORKERS_AI_IMAGE_OUTPUT_TOO_LARGE', 502);
  const artifact = await storePrivateArtifact(env, bytes, {
    capability: 'media.image.generate',
    model: WORKERS_AI_IMAGE_MODEL,
    mime: 'image/jpeg',
    extension: 'jpg',
  });
  return Object.freeze({
    ok: true,
    schema: 'mel.workers-ai-media/v1',
    capability: 'media.image.generate',
    provider: 'workers-ai',
    model: WORKERS_AI_IMAGE_MODEL,
    zero_added_cost: true,
    artifact,
    provenance,
  });
}

async function responseBytes(value) {
  if (value instanceof Response) {
    if (!value.ok) throw mediaError('WORKERS_AI_TTS_UPSTREAM_FAILED', value.status >= 400 && value.status <= 599 ? value.status : 502);
    return {
      bytes: new Uint8Array(await value.arrayBuffer()),
      mime: clean(value.headers.get('content-type') || 'audio/mpeg', 160),
    };
  }
  if (value instanceof ReadableStream) {
    return {
      bytes: new Uint8Array(await new Response(value).arrayBuffer()),
      mime: 'audio/mpeg',
    };
  }
  if (value instanceof Uint8Array) return { bytes: value, mime: 'audio/mpeg' };
  if (value instanceof ArrayBuffer) return { bytes: new Uint8Array(value), mime: 'audio/mpeg' };
  throw mediaError('WORKERS_AI_TTS_OUTPUT_INVALID', 502);
}

async function audioSynthesize(env, input = {}) {
  const provenance = freshZeroCostProof(env, TTS_ADAPTER_ID, WORKERS_AI_TTS_MODEL);
  if (!provenance) throw mediaError('WORKERS_AI_ZERO_COST_PROOF_REQUIRED');
  if (!env?.AI?.run) throw mediaError('AI_BINDING_MISSING');
  if (!mediaStorageReady(env)) throw mediaError('MEDIA_VAULT_UNAVAILABLE');

  const text = clean(input.text, 12_000);
  if (!text) throw mediaError('AUDIO_TEXT_INVALID', 400);
  const requestedSpeaker = clean(input.voice || input.speaker, 32).toLowerCase();
  const speaker = AURA_SPEAKERS.has(requestedSpeaker) ? requestedSpeaker : undefined;
  const request = {
    text,
    encoding: 'mp3',
    ...(speaker ? { speaker } : {}),
  };
  const result = await env.AI.run(WORKERS_AI_TTS_MODEL, request, { returnRawResponse: true });
  const normalized = await responseBytes(result);
  if (!normalized.bytes.byteLength) throw mediaError('WORKERS_AI_TTS_OUTPUT_EMPTY', 502);
  if (normalized.bytes.byteLength > MAX_AUDIO_BYTES) throw mediaError('WORKERS_AI_TTS_OUTPUT_TOO_LARGE', 502);
  const mime = normalized.mime.includes('audio/') ? normalized.mime : 'audio/mpeg';
  const artifact = await storePrivateArtifact(env, normalized.bytes, {
    capability: 'media.audio.synthesize',
    model: WORKERS_AI_TTS_MODEL,
    mime,
    extension: 'mp3',
  });
  return Object.freeze({
    ok: true,
    schema: 'mel.workers-ai-media/v1',
    capability: 'media.audio.synthesize',
    provider: 'workers-ai',
    model: WORKERS_AI_TTS_MODEL,
    zero_added_cost: true,
    artifact,
    provenance,
  });
}

export async function transcribeAudioBytes(env, bytesInput, options = {}) {
  const provenance = freshZeroCostProof(env, TRANSCRIPTION_ADAPTER_ID, WORKERS_AI_TRANSCRIPTION_MODEL);
  if (!provenance) throw mediaError('WORKERS_AI_ZERO_COST_PROOF_REQUIRED');
  if (!env?.AI?.run) throw mediaError('AI_BINDING_MISSING');

  const bytes = bytesInput instanceof Uint8Array ? bytesInput : new Uint8Array(bytesInput || []);
  if (!bytes.byteLength) throw mediaError('AUDIO_INPUT_REQUIRED', 400);
  if (bytes.byteLength > MAX_INLINE_TRANSCRIPTION_BYTES) {
    throw mediaError('AUDIO_TRANSCRIPTION_REQUIRES_CHUNKING', 413);
  }
  const language = clean(options.language, 16).toLowerCase();
  const task = clean(options.task || 'transcribe', 16).toLowerCase() === 'translate'
    ? 'translate'
    : 'transcribe';
  const result = await env.AI.run(WORKERS_AI_TRANSCRIPTION_MODEL, {
    audio: bytesBase64(bytes),
    task,
    ...(language ? { language } : {}),
    vad_filter: options.vad_filter === true,
  });
  const normalized = normalizeTranscriptionResult(result);
  if (!normalized.text) throw mediaError('WORKERS_AI_TRANSCRIPTION_EMPTY', 502);
  return Object.freeze({
    ok: true,
    schema: 'mel.workers-ai-media/v1',
    capability: 'media.audio.transcribe',
    provider: 'workers-ai',
    model: WORKERS_AI_TRANSCRIPTION_MODEL,
    zero_added_cost: true,
    text: normalized.text,
    word_count: normalized.word_count,
    provenance,
  });
}

async function audioTranscribe(env, input = {}) {
  let bytes = null;
  if (input?.bytes instanceof Uint8Array) bytes = input.bytes;
  else if (input?.bytes instanceof ArrayBuffer) bytes = new Uint8Array(input.bytes);
  else {
    const encoded = clean(input?.audio_base64 ?? input?.audio, 16_000_000);
    if (encoded) bytes = base64Bytes(encoded);
  }
  if (!bytes?.byteLength) throw mediaError('AUDIO_INPUT_REQUIRED', 400);
  return transcribeAudioBytes(env, bytes, {
    language: input?.language,
    task: input?.task,
    vad_filter: input?.vad_filter,
  });
}

/**
 * Returns only adapters that are executable at zero added cost right now.
 * Missing/stale proof or Media Vault configuration leaves the capability
 * unavailable instead of silently falling back to a billable provider.
 */
export function createWorkersAiZeroCostMediaCapabilities(env = {}) {
  const adapters = {};
  if (adapterReady(env, IMAGE_ADAPTER_ID, WORKERS_AI_IMAGE_MODEL)) {
    adapters['media.image.generate'] = input => imageGenerate(env, input);
  }
  if (adapterReady(env, TTS_ADAPTER_ID, WORKERS_AI_TTS_MODEL)) {
    adapters['media.audio.synthesize'] = input => audioSynthesize(env, input);
  }
  if (env?.AI?.run && freshZeroCostProof(env, TRANSCRIPTION_ADAPTER_ID, WORKERS_AI_TRANSCRIPTION_MODEL)) {
    adapters['media.audio.transcribe'] = input => audioTranscribe(env, input);
  }
  return Object.freeze(adapters);
}

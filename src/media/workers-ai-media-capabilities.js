import { workersAiRuntimeZeroCostProvenance } from '../augmentio/workers-ai-zero-cost-proof.js';
import { createEnvMediaVaultCodec } from './media-vault-crypto.js';
import { browserRunZeroCostProvenance } from './browser-run-zero-cost-proof.js';

export const WORKERS_AI_IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
export const WORKERS_AI_VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
export const WORKERS_AI_IMAGE_EDIT_MODEL = '@cf/black-forest-labs/flux-2-klein-4b';
export const WORKERS_AI_TTS_MODEL = '@cf/deepgram/aura-1';
export const WORKERS_AI_TRANSCRIPTION_MODEL = '@cf/openai/whisper-large-v3-turbo';

const IMAGE_ADAPTER_ID = 'workers-ai.media.image.flux-1-schnell';
const IMAGE_ANALYZE_ADAPTER_ID = 'workers-ai.media.image.llama-3.2-11b-vision';
const IMAGE_PROCESS_ADAPTER_ID = 'workers-ai.media.image.flux-2-klein-4b';
const TTS_ADAPTER_ID = 'workers-ai.media.audio.aura-1';
const TRANSCRIPTION_ADAPTER_ID = 'workers-ai.media.audio.whisper-large-v3-turbo';
const MAX_IMAGE_BYTES = 20_000_000;
const MAX_AUDIO_BYTES = 20_000_000;
const MAX_VIDEO_INPUT_BYTES = 10_000_000;
const MAX_VIDEO_OUTPUT_BYTES = 12_000_000;
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

function imageInputBytes(input = {}) {
  if (input?.bytes instanceof Uint8Array) return input.bytes;
  if (input?.bytes instanceof ArrayBuffer) return new Uint8Array(input.bytes);
  const encoded = clean(input?.image_base64 ?? input?.image ?? input?.data, 40_000_000);
  if (!encoded) return null;
  const normalized = encoded.includes(',') ? encoded.slice(encoded.indexOf(',') + 1) : encoded;
  const bytes = base64Bytes(normalized);
  if (!bytes.byteLength) return null;
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw mediaError('WORKERS_AI_IMAGE_INPUT_TOO_LARGE', 413);
  return bytes;
}

function imageMime(input = {}) {
  const explicit = clean(input?.mime ?? input?.mime_type, 120).toLowerCase();
  if (/^image\/(png|jpeg|jpg|webp)$/.test(explicit)) return explicit === 'image/jpg' ? 'image/jpeg' : explicit;
  const encoded = clean(input?.image_base64 ?? input?.image ?? input?.data, 240);
  const match = encoded.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,/i);
  if (match) return match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  return 'image/png';
}

async function imageInputData(env, input = {}) {
  if (input?.artifact_key) {
    const artifact = await readPrivateArtifactBytes(env, input.artifact_key);
    if (!artifact.mime.startsWith('image/')) throw mediaError('IMAGE_ARTIFACT_REQUIRED', 415);
    if (!artifact.bytes.byteLength || artifact.bytes.byteLength > MAX_IMAGE_BYTES) throw mediaError('WORKERS_AI_IMAGE_INPUT_TOO_LARGE', 413);
    return { bytes: artifact.bytes, mime: artifact.mime };
  }
  const bytes = imageInputBytes(input);
  return { bytes, mime: imageMime(input) };
}

function modelText(result) {
  return clean(
    result?.response
      ?? result?.result?.response
      ?? result?.choices?.[0]?.message?.content
      ?? result?.result?.choices?.[0]?.message?.content
      ?? result?.text,
    120_000,
  );
}

function aiReady(env, adapterId, modelId) {
  return Boolean(env?.AI?.run && freshZeroCostProof(env, adapterId, modelId));
}

async function videoInputData(env, input = {}) {
  if (input?.artifact_key) {
    const artifact = await readPrivateArtifactBytes(env, input.artifact_key);
    if (!artifact.mime.startsWith('video/')) throw mediaError('VIDEO_ARTIFACT_REQUIRED', 415);
    if (!artifact.bytes.byteLength || artifact.bytes.byteLength > MAX_VIDEO_INPUT_BYTES) throw mediaError('VIDEO_BYTES_INVALID', 413);
    return { bytes: artifact.bytes, mime: artifact.mime };
  }
  let bytes = null;
  if (input?.bytes instanceof Uint8Array) bytes = input.bytes;
  else if (input?.bytes instanceof ArrayBuffer) bytes = new Uint8Array(input.bytes);
  else {
    const encoded = clean(input?.video_base64 ?? input?.video ?? input?.data, 16_000_000);
    if (encoded) {
      const normalized = encoded.includes(',') ? encoded.slice(encoded.indexOf(',') + 1) : encoded;
      bytes = base64Bytes(normalized);
    }
  }
  if (!bytes?.byteLength) return { bytes: null, mime: null };
  if (bytes.byteLength > MAX_VIDEO_INPUT_BYTES) throw mediaError('VIDEO_BYTES_INVALID', 413);
  const rawMime = clean(input?.mime ?? input?.mime_type, 120).toLowerCase();
  const mime = ['video/webm','video/mp4','video/ogg'].includes(rawMime) ? rawMime : 'video/webm';
  return { bytes, mime };
}

function browserMediaReady(env) {
  return Boolean(
    env?.MEL_BROWSER_COMPANION
    && typeof env.MEL_BROWSER_COMPANION.fetch === 'function'
    && browserRunZeroCostProvenance(env),
  );
}

function boundedSeconds(value, fallback = 6, max = 6) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.max(0.5, n));
}

async function browserMediaCall(env, path, payload, {
  maxResponseChars = 20_000_000,
  failureCode = 'BROWSER_MEDIA_FAILED',
} = {}) {
  if (!browserMediaReady(env)) throw mediaError('BROWSER_MEDIA_RUNTIME_UNAVAILABLE');
  const response = await env.MEL_BROWSER_COMPANION.fetch(new Request(
    'https://browser-companion.internal' + path,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    },
  ));
  const raw = await response.text();
  if (raw.length > maxResponseChars) throw mediaError('BROWSER_MEDIA_RESPONSE_TOO_LARGE', 502);
  let body;
  try { body = raw ? JSON.parse(raw) : {}; }
  catch { throw mediaError('BROWSER_MEDIA_INVALID_JSON', 502); }
  if (!response.ok || body?.ok !== true) {
    throw mediaError(clean(body?.code, 160) || failureCode, response.status || 502);
  }
  return body;
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

export function mediaStorageReady(env = {}) {
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

export async function storePrivateArtifact(env, bytesInput, {
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
      id,
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

function workersAiSchemaMismatch(error) {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || error || '');
  return code === '5006' || /(?:^|\\b)5006(?:\\b|:)|unevaluated properties|max_tokens.*not allowed/i.test(message);
}

function markdownDescription(result) {
  const rows = Array.isArray(result) ? result : Array.isArray(result?.result) ? result.result : [result];
  for (const row of rows) {
    const text = clean(row?.data ?? row?.text ?? row?.markdown, 12000);
    if (text) return text;
  }
  return '';
}

async function imageAnalyze(env, input = {}) {
  const provenance = freshZeroCostProof(env, IMAGE_ANALYZE_ADAPTER_ID, WORKERS_AI_VISION_MODEL);
  if (!provenance) throw mediaError('WORKERS_AI_ZERO_COST_PROOF_REQUIRED');
  if (!env?.AI?.run) throw mediaError('AI_BINDING_MISSING');

  const imageInput = await imageInputData(env, input);
  const bytes = imageInput.bytes;
  if (!bytes?.byteLength) throw mediaError('IMAGE_INPUT_REQUIRED', 400);
  const mime = imageInput.mime;
  const prompt = clean(input?.prompt || input?.question || 'Analyse cette image précisément. Décris les éléments visibles, le texte lisible, les relations spatiales et les incertitudes. N’invente rien.', 6000);
  const image = `data:${mime};base64,${bytesBase64(bytes)}`;

  const result = await env.AI.run(WORKERS_AI_VISION_MODEL, {
    messages: [
      { role: 'system', content: 'Tu analyses uniquement ce qui est observable dans l’image. Signale explicitement toute incertitude.' },
      { role: 'user', content: prompt },
    ],
    image,
    max_tokens: 512,
    temperature: 0.1,
  }, { rejectIfBusy: true });

  const analysis = modelText(result);
  if (!analysis) throw mediaError('WORKERS_AI_IMAGE_ANALYSIS_EMPTY', 502);
  return Object.freeze({
    ok: true,
    schema: 'mel.workers-ai-media/v1',
    capability: 'media.image.analyze',
    provider: 'workers-ai',
    model: WORKERS_AI_VISION_MODEL,
    engine: 'workers-ai-llama-3.2-vision',
    zero_added_cost: true,
    analysis,
    source: Object.freeze({
      mime,
      size: bytes.byteLength,
      sha256: await sha256Hex(bytes),
    }),
    provenance,
  });
}
async function imageProcess(env, input = {}) {
  const provenance = freshZeroCostProof(env, IMAGE_PROCESS_ADAPTER_ID, WORKERS_AI_IMAGE_EDIT_MODEL);
  if (!provenance) throw mediaError('WORKERS_AI_ZERO_COST_PROOF_REQUIRED');
  if (!env?.AI?.run) throw mediaError('AI_BINDING_MISSING');
  if (!mediaStorageReady(env)) throw mediaError('MEDIA_VAULT_UNAVAILABLE');

  const browserProvenance = browserRunZeroCostProvenance(env);
  if (!browserProvenance) throw mediaError('BROWSER_RUN_ZERO_COST_PROOF_REQUIRED');
  if (!browserMediaReady(env)) throw mediaError('BROWSER_IMAGE_RESIZER_UNAVAILABLE');
  const imageInput = await imageInputData(env, input);
  const sourceBytes = imageInput.bytes;
  if (!sourceBytes?.byteLength) throw mediaError('IMAGE_INPUT_REQUIRED', 400);
  const prompt = clean(input?.prompt || input?.instruction || input?.operation, 6000);
  if (!prompt) throw mediaError('IMAGE_PROCESS_INSTRUCTION_REQUIRED', 400);

  const resized = await browserMediaCall(env, '/v1/media/resize-image', {
    schema: 'mel.media.browser-resize-image/v1',
    base64: bytesBase64(sourceBytes),
    mime: imageInput.mime,
    max_edge: 510,
  }, { maxResponseChars: 12_000_000, failureCode: 'BROWSER_IMAGE_RESIZE_FAILED' });
  const bytes = base64Bytes(resized.base64);
  const mime = clean(resized.mime, 120) || 'image/jpeg';
  if (!bytes.byteLength || Number(resized.width || 0) >= 512 || Number(resized.height || 0) >= 512) {
    throw mediaError('BROWSER_IMAGE_RESIZE_CONTRACT_FAILED', 502);
  }

  const form = new FormData();
  form.append('prompt', prompt);
  form.append('input_image_0', new Blob([bytes], { type: mime }), 'input-image');
  const width = Number(input?.width ?? input?.params?.width);
  const height = Number(input?.height ?? input?.params?.height);
  if (Number.isInteger(width) && width >= 256 && width <= 1920) form.append('width', String(width));
  if (Number.isInteger(height) && height >= 256 && height <= 1920) form.append('height', String(height));
  const packed = new Response(form);
  const contentType = packed.headers.get('content-type');
  const result = await env.AI.run(WORKERS_AI_IMAGE_EDIT_MODEL, {
    multipart: {
      body: packed.body,
      contentType,
    },
  }, { rejectIfBusy: true });

  const encoded = clean(result?.image ?? result?.result?.image, 40_000_000);
  if (!encoded) throw mediaError('WORKERS_AI_IMAGE_PROCESS_OUTPUT_INVALID', 502);
  const output = base64Bytes(encoded.includes(',') ? encoded.slice(encoded.indexOf(',') + 1) : encoded);
  if (!output.byteLength) throw mediaError('WORKERS_AI_IMAGE_PROCESS_OUTPUT_EMPTY', 502);
  if (output.byteLength > MAX_IMAGE_BYTES) throw mediaError('WORKERS_AI_IMAGE_OUTPUT_TOO_LARGE', 502);
  const artifact = await storePrivateArtifact(env, output, {
    capability: 'media.image.process',
    model: WORKERS_AI_IMAGE_EDIT_MODEL,
    mime: 'image/jpeg',
    extension: 'jpg',
  });
  return Object.freeze({
    ok: true,
    schema: 'mel.workers-ai-media/v1',
    capability: 'media.image.process',
    provider: 'workers-ai+browser-run',
    engine: 'flux2-reference-edit',
    model: WORKERS_AI_IMAGE_EDIT_MODEL,
    zero_added_cost: true,
    artifact,
    input_sha256: await sha256Hex(sourceBytes),
    reference_resize: Object.freeze({
      width: Number(resized.width || 0),
      height: Number(resized.height || 0),
    }),
    provenance: Object.freeze({
      workers_ai: provenance,
      browser_run: browserProvenance,
    }),
  });
}

export async function readPrivateArtifactBytes(env = {}, keyInput = '') {
  const key = clean(keyInput, 1200);
  if (!key || !key.startsWith('generated/')) throw mediaError('MEDIA_ARTIFACT_KEY_INVALID', 400);
  if (!env?.MEDIA_BUCKET || typeof env.MEDIA_BUCKET.get !== 'function') throw mediaError('MEDIA_VAULT_UNAVAILABLE', 503);
  const object = await env.MEDIA_BUCKET.get(key);
  if (!object) throw mediaError('MEDIA_ARTIFACT_NOT_FOUND', 404);
  const ciphertext = new Uint8Array(await object.arrayBuffer());
  const metadata = object.customMetadata || {};
  const id = clean(metadata.id, 200) || clean(key.split('/').pop()?.split('.')[0], 200);
  const owner = clean(metadata.owner || env.MELITURGOS_USER || 'owner', 200) || 'owner';
  const capability = clean(metadata.capability, 160);
  const model = clean(metadata.model, 300);
  const mime = clean(metadata.originalMime, 160);
  const plaintextSha256 = clean(metadata.sha256 || metadata.plaintextSha256, 64).toLowerCase();
  if (!id || !capability || !model || !mime || !/^[0-9a-f]{64}$/.test(plaintextSha256)) {
    throw mediaError('MEDIA_ARTIFACT_METADATA_INVALID', 409);
  }
  const codec = createEnvMediaVaultCodec(env);
  const bytes = await codec.open({
    ciphertext,
    metadata,
    aad: {
      schema: 'MEL_MEDIA_GENERATED_AAD_V1',
      id,
      owner,
      capability,
      model,
      mime,
      plaintext_sha256: plaintextSha256,
    },
  });
  return Object.freeze({
    key,
    id,
    bytes,
    mime,
    capability,
    model,
    sha256: plaintextSha256,
    size: bytes.byteLength,
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

async function videoGenerate(env, input = {}) {
  const workersProvenance = freshZeroCostProof(env, IMAGE_ADAPTER_ID, WORKERS_AI_IMAGE_MODEL);
  if (!workersProvenance) throw mediaError('WORKERS_AI_ZERO_COST_PROOF_REQUIRED');
  const browserProvenance = browserRunZeroCostProvenance(env);
  if (!browserProvenance) throw mediaError('BROWSER_RUN_ZERO_COST_PROOF_REQUIRED');
  if (!browserMediaReady(env)) throw mediaError('BROWSER_MEDIA_RUNTIME_UNAVAILABLE');
  if (!mediaStorageReady(env)) throw mediaError('MEDIA_VAULT_UNAVAILABLE');

  const prompt = clean(input?.prompt || input?.description, 4000);
  if (!prompt) throw mediaError('MEDIA_PROMPT_REQUIRED', 400);
  const width = Math.round(Math.min(960, Math.max(256, Number(input?.width) || 640)));
  const height = Math.round(Math.min(540, Math.max(144, Number(input?.height) || 360)));
  const durationMs = Math.round(Math.min(6000, Math.max(1500, (Number(input?.duration_seconds) || 3) * 1000)));
  const fps = Math.round(Math.min(20, Math.max(8, Number(input?.fps) || 12)));
  const requestedFrames = Math.round(Math.min(2, Math.max(1, Number(input?.frame_count) || 1)));
  const frames = [];

  for (let i = 0; i < requestedFrames; i += 1) {
    const framePrompt = requestedFrames === 1
      ? prompt
      : `${prompt}. Cinematic storyboard frame ${i + 1} of ${requestedFrames}; preserve the same subject, setting, palette and visual identity.`;
    const result = await env.AI.run(WORKERS_AI_IMAGE_MODEL, {
      prompt: framePrompt,
      steps: 4,
    }, { rejectIfBusy: true });
    const encoded = clean(result?.image ?? result?.result?.image, 40_000_000);
    if (!encoded) throw mediaError('WORKERS_AI_VIDEO_FRAME_EMPTY', 502);
    frames.push({
      mime: 'image/jpeg',
      base64: encoded.includes(',') ? encoded.slice(encoded.indexOf(',') + 1) : encoded,
    });
  }

  const renderResponse = await env.MEL_BROWSER_COMPANION.fetch(new Request(
    'https://browser-companion.internal/v1/media/render-video',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        schema: 'mel.media.browser-render-video/v1',
        frames,
        width,
        height,
        duration_ms: durationMs,
        fps,
      }),
    },
  ));
  const raw = await renderResponse.text();
  if (raw.length > 20_000_000) throw mediaError('BROWSER_VIDEO_RENDER_RESPONSE_TOO_LARGE', 502);
  let rendered;
  try { rendered = raw ? JSON.parse(raw) : {}; } catch { throw mediaError('BROWSER_VIDEO_RENDER_INVALID_JSON', 502); }
  if (!renderResponse.ok || rendered?.ok !== true || !rendered?.base64) {
    throw mediaError(clean(rendered?.code, 160) || 'BROWSER_VIDEO_RENDER_FAILED', renderResponse.status || 502);
  }
  const videoBytes = base64Bytes(rendered.base64);
  if (!videoBytes.byteLength || videoBytes.byteLength > MAX_VIDEO_OUTPUT_BYTES) throw mediaError('BROWSER_VIDEO_RENDER_OUTPUT_INVALID', 502);
  const artifact = await storePrivateArtifact(env, videoBytes, {
    capability: 'media.video.generate',
    model: 'mel-flux-browser-video-v1',
    mime: clean(rendered.mime, 120) || 'video/webm',
    extension: 'webm',
  });
  return Object.freeze({
    ok: true,
    schema: 'mel.zero-cost-video-generation/v1',
    capability: 'media.video.generate',
    provider: 'workers-ai+browser-run',
    engine: 'generated-frame-animation',
    zero_added_cost: true,
    prompt_sha256: await sha256Hex(new TextEncoder().encode(prompt)),
    frame_count: frames.length,
    width,
    height,
    duration_seconds: durationMs / 1000,
    fps,
    artifact,
    provenance: Object.freeze({
      image_generation: workersProvenance,
      browser_render: browserProvenance,
    }),
  });
}

async function videoProcess(env, input = {}) {
  const browserProvenance = browserRunZeroCostProvenance(env);
  if (!browserProvenance) throw mediaError('BROWSER_RUN_ZERO_COST_PROOF_REQUIRED');
  if (!browserMediaReady(env)) throw mediaError('BROWSER_MEDIA_RUNTIME_UNAVAILABLE');
  if (!mediaStorageReady(env)) throw mediaError('MEDIA_VAULT_UNAVAILABLE');

  const source = await videoInputData(env, input);
  const bytes = source.bytes;
  if (!bytes?.byteLength) throw mediaError('VIDEO_INPUT_REQUIRED', 400);
  const params = input?.params && typeof input.params === 'object' ? input.params : {};
  const width = Math.round(Math.min(960, Math.max(256, Number(input?.width ?? params.width) || 640)));
  const height = Math.round(Math.min(540, Math.max(144, Number(input?.height ?? params.height) || 360)));
  const duration = boundedSeconds(input?.duration_seconds ?? params.duration_seconds, 3, 6);
  const startSeconds = Math.max(0, Math.min(60, Number(input?.start_seconds ?? params.start_seconds) || 0));
  const fps = Math.round(Math.min(20, Math.max(8, Number(input?.fps ?? params.fps) || 12)));

  const rendered = await browserMediaCall(env, '/v1/media/process-video', {
    schema: 'mel.media.browser-process-video/v1',
    base64: bytesBase64(bytes),
    mime: source.mime,
    width,
    height,
    duration_ms: Math.round(duration * 1000),
    start_ms: Math.round(startSeconds * 1000),
    fps,
    audio: input?.audio !== false,
  }, { failureCode: 'BROWSER_VIDEO_PROCESS_FAILED' });

  const output = base64Bytes(rendered.base64);
  if (!output.byteLength || output.byteLength > MAX_VIDEO_OUTPUT_BYTES) throw mediaError('BROWSER_VIDEO_PROCESS_OUTPUT_INVALID', 502);
  const artifact = await storePrivateArtifact(env, output, {
    capability: 'media.video.process',
    model: 'mel-browser-run-video-process-v1',
    mime: clean(rendered.mime, 120) || 'video/webm',
    extension: 'webm',
  });
  return Object.freeze({
    ok: true,
    schema: 'mel.browser-run-video-process/v1',
    capability: 'media.video.process',
    provider: 'cloudflare-browser-run',
    engine: 'canvas-mediarecorder',
    zero_added_cost: true,
    input_sha256: await sha256Hex(bytes),
    width,
    height,
    duration_seconds: Number(rendered.duration_ms || duration * 1000) / 1000,
    fps,
    audio_tracks: Number(rendered.audio_tracks || 0),
    artifact,
    provenance: browserProvenance,
  });
}

async function videoAnalyze(env, input = {}) {
  const browserProvenance = browserRunZeroCostProvenance(env);
  if (!browserProvenance) throw mediaError('BROWSER_RUN_ZERO_COST_PROOF_REQUIRED');
  if (!browserMediaReady(env)) throw mediaError('BROWSER_MEDIA_RUNTIME_UNAVAILABLE');
  if (!aiReady(env, IMAGE_ANALYZE_ADAPTER_ID, WORKERS_AI_VISION_MODEL)) throw mediaError('WORKERS_AI_VISION_UNAVAILABLE');
  if (!aiReady(env, TRANSCRIPTION_ADAPTER_ID, WORKERS_AI_TRANSCRIPTION_MODEL)) throw mediaError('WORKERS_AI_TRANSCRIPTION_UNAVAILABLE');

  const source = await videoInputData(env, input);
  const bytes = source.bytes;
  if (!bytes?.byteLength) throw mediaError('VIDEO_INPUT_REQUIRED', 400);
  const duration = boundedSeconds(input?.duration_seconds, 4, 6);
  const imageCount = Math.min(8, Math.max(3, Math.round(Number(input?.image_count) || 4)));
  const startSeconds = Math.max(0, Math.min(60, Number(input?.start_seconds) || 0));

  const sampled = await browserMediaCall(env, '/v1/media/sample-video', {
    schema: 'mel.media.browser-sample-video/v1',
    base64: bytesBase64(bytes),
    mime: source.mime,
    duration_ms: Math.round(duration * 1000),
    start_ms: Math.round(startSeconds * 1000),
    image_count: imageCount,
  }, { failureCode: 'BROWSER_VIDEO_SAMPLE_FAILED' });

  const visualAnalysis = await imageAnalyze(env, {
    image_base64: sampled.spritesheet_base64,
    mime: sampled.spritesheet_mime || 'image/jpeg',
    prompt: clean(input?.prompt, 6000) || 'Analyse ce storyboard extrait de la vidéo. Décris les scènes, sujets, actions, changements, texte visible et incertitudes. N’invente rien.',
  });

  let transcript = null;
  let transcriptStatus = 'NO_AUDIO_TRACK_OR_NOT_CAPTURED';
  if (sampled?.audio_base64) {
    try {
      const audioBytes = base64Bytes(sampled.audio_base64);
      if (audioBytes.byteLength <= MAX_INLINE_TRANSCRIPTION_BYTES) {
        const transcribed = await transcribeAudioBytes(env, audioBytes, {
          language: input?.language,
          vad_filter: true,
        });
        transcript = transcribed.text;
        transcriptStatus = 'TRANSCRIBED';
      } else {
        transcriptStatus = 'AUDIO_TOO_LARGE_FOR_INLINE_TRANSCRIPTION';
      }
    } catch (error) {
      transcriptStatus = clean(error?.code || error?.message, 180) || 'AUDIO_ANALYSIS_UNAVAILABLE';
    }
  }

  const synthesisPrompt = [
    'Tu synthétises une analyse vidéo à partir de preuves extraites localement.',
    'Analyse visuelle:',
    visualAnalysis.analysis,
    'Transcription audio:',
    transcript || '(aucune piste audio capturée)',
    'Distingue explicitement ce qui est visible de ce qui est entendu.',
  ].join('\n');
  const synthesis = await env.AI.run(WORKERS_AI_VISION_MODEL, {
    messages: [{ role: 'user', content: synthesisPrompt }],
    chat_template_kwargs: { enable_thinking: false },
  }, { rejectIfBusy: true });
  const summary = modelText(synthesis) || visualAnalysis.analysis;

  return Object.freeze({
    ok: true,
    schema: 'mel.browser-run-video-analysis/v1',
    capability: 'media.video.analyze',
    provider: 'cloudflare-browser-run+workers-ai',
    zero_added_cost: true,
    sampled_duration_seconds: Number(sampled.duration_ms || duration * 1000) / 1000,
    sampled_frame_count: Number(sampled.image_count || imageCount),
    input_sha256: await sha256Hex(bytes),
    visual_analysis: visualAnalysis.analysis,
    transcript,
    transcript_status: transcriptStatus,
    summary,
    provenance: Object.freeze({
      browser_run: browserProvenance,
      vision: visualAnalysis.provenance,
    }),
  });
}

async function audioTranscribe(env, input = {}) {
  let bytes = null;
  if (input?.artifact_key) {
    const artifact = await readPrivateArtifactBytes(env, input.artifact_key);
    if (!artifact.mime.startsWith('audio/')) throw mediaError('AUDIO_ARTIFACT_REQUIRED', 415);
    bytes = artifact.bytes;
  } else if (input?.bytes instanceof Uint8Array) bytes = input.bytes;
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
  if (aiReady(env, IMAGE_ANALYZE_ADAPTER_ID, WORKERS_AI_VISION_MODEL)) {
    adapters['media.image.analyze'] = input => imageAnalyze(env, input);
  }
  if (adapterReady(env, IMAGE_PROCESS_ADAPTER_ID, WORKERS_AI_IMAGE_EDIT_MODEL)
    && browserMediaReady(env)) {
    adapters['media.image.process'] = input => imageProcess(env, input);
  }
  if (adapterReady(env, IMAGE_ADAPTER_ID, WORKERS_AI_IMAGE_MODEL)) {
    adapters['media.image.generate'] = input => imageGenerate(env, input);
  }
  if (adapterReady(env, TTS_ADAPTER_ID, WORKERS_AI_TTS_MODEL)) {
    adapters['media.audio.synthesize'] = input => audioSynthesize(env, input);
  }
  if (aiReady(env, TRANSCRIPTION_ADAPTER_ID, WORKERS_AI_TRANSCRIPTION_MODEL)) {
    adapters['media.audio.transcribe'] = input => audioTranscribe(env, input);
  }
  if (browserMediaReady(env) && mediaStorageReady(env)) {
    adapters['media.video.process'] = input => videoProcess(env, input);
  }
  if (browserMediaReady(env)
    && aiReady(env, IMAGE_ANALYZE_ADAPTER_ID, WORKERS_AI_VISION_MODEL)
    && aiReady(env, TRANSCRIPTION_ADAPTER_ID, WORKERS_AI_TRANSCRIPTION_MODEL)) {
    adapters['media.video.analyze'] = input => videoAnalyze(env, input);
  }
  if (browserMediaReady(env)
    && adapterReady(env, IMAGE_ADAPTER_ID, WORKERS_AI_IMAGE_MODEL)) {
    adapters['media.video.generate'] = input => videoGenerate(env, input);
  }
  return Object.freeze(adapters);
}

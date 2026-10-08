import { createDefaultCapabilityBus } from '../capabilities/default-bus.js';
import { creativeMediaCapabilityIds } from '../capabilities/creative-media-capabilities.js';

const REQUIRED = Object.freeze(creativeMediaCapabilityIds());
const STEP_TIMEOUT_MS = 55_000;

function proofError(code, status = 503, details = {}) {
  return Object.assign(new Error(code), { code, status, ...details });
}

function exactSha(value) {
  const sha = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(sha) ? sha : '';
}

async function bounded(promise, label, timeoutMs = STEP_TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(proofError('MEL_MEDIA_02_STEP_TIMEOUT', 504, { step: label })), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function artifactKey(result, step) {
  const key = String(result?.artifact?.key || '').trim();
  if (!key.startsWith('generated/')) throw proofError('MEL_MEDIA_02_ARTIFACT_MISSING', 502, { step });
  if (result?.artifact?.stored_encrypted !== true || result?.artifact?.private !== true) {
    throw proofError('MEL_MEDIA_02_ARTIFACT_NOT_PRIVATE_ENCRYPTED', 502, { step });
  }
  return key;
}

function safeResult(id, result, durationMs) {
  return Object.freeze({
    id,
    ok: result?.ok === true,
    provider: String(result?.provider || 'mel').slice(0, 120),
    model: result?.model ? String(result.model).slice(0, 200) : null,
    engine: result?.engine ? String(result.engine).slice(0, 160) : null,
    zero_added_cost: result?.zero_added_cost === true,
    artifact_private_encrypted: Boolean(result?.artifact?.private === true && result?.artifact?.stored_encrypted === true),
    artifact_mime: result?.artifact?.mime ? String(result.artifact.mime).slice(0, 120) : null,
    duration_ms: durationMs,
  });
}

export async function runMelMedia02LiveProof(env = {}, {
  sourceSha = '',
  audit = async () => {},
} = {}) {
  const deployedSha = exactSha(sourceSha || env?.MEL_DEPLOYED_GIT_SHA);
  if (!deployedSha) throw proofError('MEL_MEDIA_02_DEPLOYED_SHA_INVALID', 409);

  const bus = createDefaultCapabilityBus({ env, audit });
  const descriptions = {};
  for (const id of REQUIRED) {
    const row = await bounded(bus.refreshHealth(id), 'health:' + id, 20_000);
    descriptions[id] = row;
    if (String(row?.health || '').toUpperCase() !== 'HEALTHY') {
      throw proofError('MEL_MEDIA_02_CAPABILITY_NOT_HEALTHY', 503, {
        capability: id,
        health: row?.health || null,
        detail: row?.health_detail || null,
      });
    }
  }

  const results = [];
  const context = {
    owner: env?.MELITURGOS_USER || 'owner',
    permissions: [],
    approvedCapabilities: [...REQUIRED],
    requestId: crypto.randomUUID(),
  };
  const run = async (id, input) => {
    const started = Date.now();
    const result = await bounded(bus.execute(id, input, context), id);
    const safe = safeResult(id, result, Math.max(0, Date.now() - started));
    if (!safe.ok) throw proofError('MEL_MEDIA_02_EXECUTION_NOT_OK', 502, { capability: id });
    if (safe.zero_added_cost !== true) {
      throw proofError('MEL_MEDIA_02_ZERO_COST_NOT_PROVED', 409, { capability: id });
    }
    results.push(safe);
    return result;
  };

  // Image chain: generate -> analyze -> process.
  const generatedImage = await run('media.image.generate', {
    prompt: 'A simple blue geometric circle centered on a clean ivory background, flat vector style, no text.',
    params: { steps: 4 },
  });
  const imageKey = artifactKey(generatedImage, 'media.image.generate');
  const analyzedImage = await run('media.image.analyze', {
    artifact_key: imageKey,
    prompt: 'Describe only the visible geometric shape, main color and background. Be concise.',
  });
  if (!String(analyzedImage?.analysis || '').trim()) throw proofError('MEL_MEDIA_02_IMAGE_ANALYSIS_EMPTY', 502);
  const processedImage = await run('media.image.process', {
    artifact_key: imageKey,
    instruction: 'Keep the same composition but make the central geometric shape green.',
    width: 512,
    height: 512,
  });
  artifactKey(processedImage, 'media.image.process');

  // Procedural sound chain: generate -> analyze.
  const generatedAudio = await run('media.audio.generate', {
    prompt: 'short notification chime',
    duration_seconds: 1,
  });
  const audioKey = artifactKey(generatedAudio, 'media.audio.generate');
  const analyzedAudio = await run('media.audio.analyze', { artifact_key: audioKey });
  if (!Number.isFinite(Number(analyzedAudio?.rms))) throw proofError('MEL_MEDIA_02_AUDIO_ANALYSIS_INVALID', 502);

  // Speech chain: synthesize -> transcribe.
  const speech = await run('media.audio.synthesize', {
    text: 'Bonjour MEL, preuve média vérifiée.',
    voice: 'luna',
  });
  const speechKey = artifactKey(speech, 'media.audio.synthesize');
  const transcription = await run('media.audio.transcribe', {
    artifact_key: speechKey,
    language: 'fr',
    vad_filter: true,
  });
  if (!String(transcription?.text || '').trim()) throw proofError('MEL_MEDIA_02_TRANSCRIPTION_EMPTY', 502);

  // Music chain: generate -> analyze.
  const music = await run('media.music.generate', {
    prompt: 'ambient cinematic 96 bpm',
    duration_seconds: 4,
  });
  const musicKey = artifactKey(music, 'media.music.generate');
  const musicAnalysis = await run('media.music.analyze', { artifact_key: musicKey });
  if (!Number.isFinite(Number(musicAnalysis?.estimated_bpm))) throw proofError('MEL_MEDIA_02_MUSIC_ANALYSIS_INVALID', 502);

  // Video chain: generate -> process -> analyze.
  const video = await run('media.video.generate', {
    prompt: 'A blue geometric circle centered on an ivory background, minimal motion graphic, no text.',
    width: 512,
    height: 288,
    duration_seconds: 1.5,
    fps: 10,
    frame_count: 1,
  });
  const videoKey = artifactKey(video, 'media.video.generate');
  const processedVideo = await run('media.video.process', {
    artifact_key: videoKey,
    width: 480,
    height: 270,
    duration_seconds: 1.5,
    audio: false,
  });
  artifactKey(processedVideo, 'media.video.process');
  const videoAnalysis = await run('media.video.analyze', {
    artifact_key: videoKey,
    duration_seconds: 1.5,
    image_count: 3,
    language: 'fr',
    prompt: 'Describe the visible geometric content and any motion. Do not infer unseen content.',
  });
  if (!String(videoAnalysis?.summary || videoAnalysis?.visual_analysis || '').trim()) {
    throw proofError('MEL_MEDIA_02_VIDEO_ANALYSIS_EMPTY', 502);
  }

  const executed = new Set(results.map(row => row.id));
  const missing = REQUIRED.filter(id => !executed.has(id));
  if (missing.length) throw proofError('MEL_MEDIA_02_CAPABILITY_PROOF_INCOMPLETE', 502, { missing });

  return Object.freeze({
    ok: true,
    status: 'MEL_MEDIA_02_DONE_VERIFIED_ELIGIBLE',
    done_verified_eligible: true,
    schema: 'mel.media-02.live-proof/v1',
    source_sha: deployedSha,
    capability_count: REQUIRED.length,
    required_capabilities: [...REQUIRED],
    health: Object.fromEntries(REQUIRED.map(id => [id, String(descriptions[id]?.health || 'UNKNOWN')])),
    executions: results,
    encrypted_artifact_chains: {
      image: true,
      audio: true,
      speech: true,
      music: true,
      video: true,
    },
    zero_added_cost_required: true,
    all_executions_zero_added_cost: results.every(row => row.zero_added_cost === true),
    secret_values_exposed: false,
    autonomy_started: false,
    verified_at: new Date().toISOString(),
  });
}

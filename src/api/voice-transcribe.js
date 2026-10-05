import { requireAuth } from '../core/security.js';

const PRIMARY_MODEL = '@cf/openai/whisper-large-v3-turbo';
const FALLBACK_MODEL = '@cf/openai/whisper';
const MAX_AUDIO_BYTES = 15_000_000;

function resultText(value) {
  if (typeof value === 'string') return value;
  return value?.response
    ?? value?.text
    ?? value?.transcription
    ?? value?.transcription_info?.text
    ?? value?.result?.response
    ?? value?.result?.text
    ?? '';
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x4000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

export async function handleVoiceTranscription(request, env, options = {}) {
  const pathname = new URL(request.url).pathname;
  if (request.method !== 'POST' || (pathname !== '/api/voice/transcribe' && options?.authorized !== true)) return null;
  if (options?.authorized !== true) {
    const auth = requireAuth(request, env);
    if (!auth.ok) return auth.response;
  }

  const type = String(request.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('multipart/form-data')) {
    return Response.json({ ok:false, code:'AUDIO_REQUIRED', available:false, fallback:'text' }, { status:415 });
  }
  if (!env?.AI || typeof env.AI.run !== 'function') {
    return Response.json({ ok:false, code:'AI_BINDING_MISSING', available:false, fallback:'text', reason:'AI_BINDING_MISSING' }, { status:503 });
  }

  let form;
  try { form = await request.formData(); }
  catch { return Response.json({ ok:false, code:'AUDIO_REQUIRED', available:false, fallback:'text' }, { status:415 }); }

  const file = form.get('audio');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return Response.json({ ok:false, code:'AUDIO_REQUIRED', available:false, fallback:'text' }, { status:400 });
  }
  if (Number(file.size || 0) > MAX_AUDIO_BYTES) {
    return Response.json({ ok:false, code:'AUDIO_TOO_LARGE', available:false, fallback:'text' }, { status:413 });
  }

  const audioBytes = new Uint8Array(await file.arrayBuffer());
  const failures = [];

  // Primary path follows Cloudflare's current whisper-large-v3-turbo binding
  // contract: Base64 audio plus explicit transcription language/task.
  try {
    const result = await env.AI.run(PRIMARY_MODEL, {
      audio: bytesToBase64(audioBytes),
      task:'transcribe',
      language:'fr'
    });
    const text = String(resultText(result) || '').trim();
    if (text) {
      return Response.json({
        ok:true,
        text,
        language:'fr',
        model:PRIMARY_MODEL,
        fallback_model_used:false,
        stored:false,
        archive_via:'chat',
        input_source:'voice-server-transcription'
      }, { headers:{'cache-control':'no-store'} });
    }
    failures.push('PRIMARY_EMPTY');
  } catch (error) {
    failures.push('PRIMARY:'+String(error?.message || error).slice(0,120));
  }

  // Cloudflare also exposes the multilingual @cf/openai/whisper model. Its
  // documented Workers binding accepts the audio bytes as a numeric array.
  // This gives physical devices an independent ASR path when Turbo is
  // temporarily unavailable or rejects one input.
  try {
    const result = await env.AI.run(FALLBACK_MODEL, {
      audio: Array.from(audioBytes),
    });
    const text = String(resultText(result) || '').trim();
    if (text) {
      return Response.json({
        ok:true,
        text,
        language:'fr',
        model:FALLBACK_MODEL,
        fallback_model_used:true,
        stored:false,
        archive_via:'chat',
        input_source:'voice-server-transcription'
      }, { headers:{'cache-control':'no-store'} });
    }
    failures.push('FALLBACK_EMPTY');
  } catch (error) {
    failures.push('FALLBACK:'+String(error?.message || error).slice(0,120));
  }

  const emptyOnly = failures.length > 0 && failures.every(item => item.endsWith('_EMPTY'));
  return Response.json({
    ok:false,
    code:emptyOnly ? 'EMPTY_TRANSCRIPTION' : 'TRANSCRIPTION_UNAVAILABLE',
    available:false,
    fallback:'text',
    reason:emptyOnly ? 'EMPTY_TRANSCRIPTION' : 'TRANSCRIPTION_UNAVAILABLE',
    detail:failures.join(' | ').slice(0,300)
  }, { status:503 });
}

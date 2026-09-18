import { requireAuth } from '../core/security.js';

const MODEL = '@cf/openai/whisper-large-v3-turbo';
const MAX_AUDIO_BYTES = 15_000_000;

function resultText(value) {
  if (typeof value === 'string') return value;
  return value?.response ?? value?.text ?? value?.transcription ?? value?.result?.response ?? '';
}

export async function handleVoiceTranscription(request, env) {
  if (request.method !== 'POST' || new URL(request.url).pathname !== '/api/voice/transcribe') return null;
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;

  const type = String(request.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('multipart/form-data')) {
    return Response.json({ ok:false, code:'AUDIO_REQUIRED', available:false, fallback:'text' }, { status:415 });
  }
  if (!env?.AI || typeof env.AI.run !== 'function') {
    return Response.json({ ok:false, available:false, fallback:'text', reason:'AI_BINDING_MISSING' }, { status:503 });
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

  try {
    const result = await env.AI.run(MODEL, { audio:new Uint8Array(await file.arrayBuffer()), language:'fr' });
    const text = String(resultText(result) || '').trim();
    if (!text) return Response.json({ ok:false, available:false, fallback:'text', reason:'EMPTY_TRANSCRIPTION' }, { status:503 });
    return Response.json({ ok:true, text, language:'fr', model:MODEL, stored:false }, { headers:{'cache-control':'no-store'} });
  } catch {
    return Response.json({ ok:false, available:false, fallback:'text', reason:'TRANSCRIPTION_UNAVAILABLE' }, { status:503 });
  }
}

import { createConversationService } from '../conversations/conversation-service.js';
import { requireAuth } from '../core/security.js';
import { LEGACY_CHAT_INPUT_CHARS, MAX_CHAT_INPUT_CHARS, MAX_CHAT_REQUEST_BYTES } from '../core/limits.js';
import { selfAwarenessSystemContext } from '../context/self-awareness.js';

export { LEGACY_CHAT_INPUT_CHARS, MAX_CHAT_INPUT_CHARS } from '../core/limits.js';

const GENERAL_MODELS = [
  '@cf/zai-org/glm-4.7-flash',
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/google/gemma-3-12b-it',
];

const CODE_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/google/gemma-3-12b-it',
  '@cf/zai-org/glm-4.7-flash',
];

function extractText(result) {
  if (typeof result === 'string') return result;
  return result?.response ?? result?.text ?? result?.result?.response ?? result?.choices?.[0]?.message?.content ?? null;
}

function looksLikeDevelopment(text) {
  return /\b(code|coder|programme|programmer|javascript|worker|cloudflare|github|module|dévelop|develop|roadmap|feuille de route|mentor|bridge|autonom)\b/i.test(text);
}

function errorResponse(message, code, status) {
  return Response.json({ ok: false, error: message, code }, { status, headers: { 'cache-control': 'no-store' } });
}

async function archive(env, { conversationId, deviceId, userText, assistantText, model }) {
  if (!env?.DB || !conversationId) return false;
  try {
    const service = createConversationService(env);
    await service.archiveMessage({
      conversationId,
      deviceId: deviceId || null,
      role: 'user',
      content: userText,
      provenance: 'gen2-long-chat',
      metadata: { long_input: true, input_chars: userText.length, self_awareness_context: true },
    });
    await service.archiveMessage({
      conversationId,
      deviceId: deviceId || null,
      role: 'assistant',
      content: assistantText,
      model,
      provenance: 'gen2-long-chat',
      metadata: { response_to_long_input: true, self_awareness_context: true },
    });
    return true;
  } catch (error) {
    console.warn('[long-chat] archive failed', error?.message || error);
    return false;
  }
}

/** Handles prompts that exceed the legacy 12k ceiling. */
export async function maybeHandleLongChat(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/chat' || request.method !== 'POST') return null;
  if (!(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) return null;

  const declaredBytes = Number(request.headers.get('content-length') || 0);
  if (declaredBytes > MAX_CHAT_REQUEST_BYTES) return errorResponse('Requête de chat trop volumineuse.', 'REQUEST_TOO_LARGE', 413);

  let body;
  try { body = await request.clone().json(); }
  catch { return null; }

  const text = String(body?.text || '').trim();
  if (text.length <= LEGACY_CHAT_INPUT_CHARS) return null;

  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  if (text.length > MAX_CHAT_INPUT_CHARS) return errorResponse(`Message trop long (${MAX_CHAT_INPUT_CHARS.toLocaleString('fr-FR')} caractères maximum).`, 'MESSAGE_TOO_LONG', 413);
  if (!env?.AI || typeof env.AI.run !== 'function') return errorResponse('Le moteur IA long contexte est indisponible.', 'AI_BINDING_MISSING', 503);

  const theme = ['classic', 'crusade', 'religious'].includes(body?.ui_theme) ? body.ui_theme : 'classic';
  const awareness = await selfAwarenessSystemContext(env, { full: looksLikeDevelopment(text), theme });
  const models = looksLikeDevelopment(text) ? CODE_MODELS : GENERAL_MODELS;
  const messages = [
    {
      role: 'system',
      content: [
        'Tu es MEL, l’assistante personnelle de MELITURGOS.',
        'Le message utilisateur suivant est un prompt long accepté volontairement par le système.',
        'Lis-le en entier avant de répondre. Ne l’ignore pas, ne le résume pas à la place de l’exécuter et conserve toutes ses contraintes compatibles entre elles.',
        'Quand il s’agit de développement de MEL, distingue ce qui est réellement codé/testé de ce qui est seulement proposé.',
        'Tu disposes aussi de ton état interne actuel ci-dessous. Appuie-toi dessus lorsque le prompt parle de tes propres capacités, de ta roadmap ou de ce que tu développes.',
        awareness,
      ].join(' '),
    },
    { role: 'user', content: text },
  ];

  const attempts = [];
  let lastError;
  for (const model of models) {
    try {
      const result = await env.AI.run(model, { messages, temperature: 0.25, max_tokens: 2200 });
      const answer = String(extractText(result) || '').trim();
      if (!answer) throw Object.assign(new Error('EMPTY_MODEL_RESPONSE'), { code: 'EMPTY_MODEL_RESPONSE' });
      const archiveSaved = await archive(env, {
        conversationId: String(body?.conversation_id || '').slice(0, 200),
        deviceId: String(body?.device_id || '').slice(0, 200),
        userText: text,
        assistantText: answer,
        model,
      });
      return Response.json({
        ok: true,
        text: answer,
        model,
        long_input: true,
        self_aware: true,
        input_chars: text.length,
        max_input_chars: MAX_CHAT_INPUT_CHARS,
        archive_saved: archiveSaved,
        attempts: attempts.length + 1,
      }, { headers: { 'cache-control': 'no-store' } });
    } catch (error) {
      lastError = error;
      attempts.push({ model, error: String(error?.code || error?.message || 'MODEL_ERROR').slice(0, 160) });
    }
  }

  console.error('[long-chat] all providers failed', attempts);
  return errorResponse(String(lastError?.message || 'Long-context models unavailable.'), 'LONG_CONTEXT_MODELS_FAILED', 502);
}

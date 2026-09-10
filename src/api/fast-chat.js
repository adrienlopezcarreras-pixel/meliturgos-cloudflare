import { requireAuth } from '../core/security.js';
import { createConversationService } from '../conversations/conversation-service.js';

export const FAST_CHAT_MAX_CHARS = 800;
export const FAST_CHAT_MODEL = '@cf/zai-org/glm-4.7-flash';
export const FAST_CHAT_CONTEXT_MESSAGES = 6;

const COMPLEX_INTENT = /\b(?:d[ée]velop|code|programme|module|github|bridge|mentor|roadmap|feuille\s+de\s+route|fichier|document|pdf|image|audio|vid[ée]o|mail|gmail|agenda|calendar|drive|plugin|connecteur|outil|capacit[ée]|recherche|cherche|internet|web|source|actualit[ée]|news|aujourd'hui|actuel|r[ée]cent|m[ée]t[ée]o|prix|cours|bourse|compare|analyse|raisonne|d[ée]montre|calcule|diagnostic|audit|souviens|m[ée]moire|rappelle|historique|conversation\s+pr[ée]c[ée]dente)\b/i;
const MULTI_STEP = /\b(?:[ée]tape|plan|proc[ée]dure|exhaustif|complet|d[ée]taill[ée]|approfondi|plusieurs|toutes?\s+les|workflow)\b/i;

function extractText(result) {
  if (typeof result === 'string') return result;
  return result?.response ?? result?.text ?? result?.result?.response ?? result?.choices?.[0]?.message?.content ?? null;
}

export function isFastChatEligible(text) {
  const value = String(text || '').trim();
  if (!value || value.length > FAST_CHAT_MAX_CHARS) return false;
  if (COMPLEX_INTENT.test(value) || MULTI_STEP.test(value)) return false;
  return true;
}

async function recentContext(env, conversationId) {
  if (!env?.DB || !conversationId) return [];
  try {
    const rows = await env.DB.prepare(`SELECT role,content FROM archive_messages
      WHERE conversation_id=? AND role IN ('user','assistant')
      ORDER BY timestamp DESC,id DESC LIMIT ?`)
      .bind(conversationId, FAST_CHAT_CONTEXT_MESSAGES).all();
    return (rows.results || []).reverse().map(row => ({
      role: row.role === 'assistant' ? 'assistant' : 'user',
      content: String(row.content || '').slice(0, 4000),
    }));
  } catch {
    return [];
  }
}

async function persistExchange(env, { conversationId, deviceId, text, answer, model, elapsedMs }) {
  if (!env?.DB || !conversationId) return false;
  try {
    const service = createConversationService(env);
    await service.archiveMessage({
      conversationId,
      deviceId,
      role: 'user',
      content: text,
      provenance: 'fast-chat',
      metadata: { fast_lane: true },
    });
    await service.archiveMessage({
      conversationId,
      deviceId,
      role: 'assistant',
      content: answer,
      model,
      provenance: 'fast-chat',
      metadata: { fast_lane: true, latency_ms: elapsedMs },
    });
    return true;
  } catch (error) {
    console.warn('[fast-chat] archive failed', error?.message || error);
    return false;
  }
}

/**
 * Low-latency path for ordinary short conversation. Anything ambiguous or
 * tool/development/memory heavy deliberately falls through to the full router.
 */
export async function maybeHandleFastChat(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/chat' || request.method !== 'POST') return null;
  if (!(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) return null;
  if (!env?.AI || typeof env.AI.run !== 'function') return null;

  let body;
  try { body = await request.clone().json(); }
  catch { return null; }
  if (body?.capability?.id) return null;

  const text = String(body?.text || '').trim();
  if (!isFastChatEligible(text)) return null;

  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;

  const conversationId = String(body?.conversation_id || '').slice(0, 200);
  const deviceId = String(body?.device_id || '').slice(0, 200) || null;
  const history = await recentContext(env, conversationId);
  const messages = [
    {
      role: 'system',
      content: 'Tu es MEL. Réponds immédiatement, naturellement et de façon concise. Si la demande nécessite un outil, des données actuelles, une analyse approfondie ou une mémoire non présente dans le contexte fourni, dis-le brièvement au lieu d’inventer.'
    },
    ...history,
    { role: 'user', content: text },
  ];

  const started = Date.now();
  try {
    const result = await env.AI.run(FAST_CHAT_MODEL, {
      messages,
      temperature: 0.25,
      max_tokens: 650,
    });
    const answer = String(extractText(result) || '').trim();
    if (!answer) return null;
    const elapsedMs = Date.now() - started;
    const persistence = persistExchange(env, {
      conversationId,
      deviceId,
      text,
      answer,
      model: FAST_CHAT_MODEL,
      elapsedMs,
    });
    let archiveSaved = null;
    if (ctx?.waitUntil) ctx.waitUntil(persistence);
    else archiveSaved = await persistence;

    return Response.json({
      ok: true,
      text: answer,
      model: FAST_CHAT_MODEL,
      fast_lane: true,
      latency_ms: elapsedMs,
      context_messages: history.length,
      archive_saved: archiveSaved,
    }, { headers: { 'cache-control': 'no-store', 'x-mel-lane': 'fast' } });
  } catch (error) {
    console.warn('[fast-chat] fallback to full router', error?.message || error);
    return null;
  }
}

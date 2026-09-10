import { requireAuth } from '../core/security.js';
import { createConversationService } from '../conversations/conversation-service.js';
import { selfAwarenessSystemContext, getSelfAwarenessSnapshot } from '../context/self-awareness.js';

const MODEL = '@cf/zai-org/glm-4.7-flash';
const CONTEXT_MESSAGES = 8;
const SELF_STATE_MAX_CHARS = 4000;

const SELF_STATE_INTENT = /\b(?:que\s+(?:sais|peux)[- ]?tu\s+faire|qu['’]est[- ]?ce\s+que\s+tu\s+(?:sais|peux|fais|d[ée]veloppes?)|tes?\s+(?:capacit[ée]s?|comp[ée]tences?|outils?|modules?|connecteurs?|fonctions?)|quels?\s+(?:outils?|modules?|connecteurs?|mod[èe]les?|capacit[ée]s?|comp[ée]tences?)|o[uù]\s+en\s+es[- ]?tu|ton\s+[ée]tat|ta\s+roadmap|ta\s+feuille\s+de\s+route|ton\s+d[ée]veloppement|ce\s+que\s+tu\s+d[ée]veloppes?|sur\s+quoi\s+tu\s+travailles?|qu['’]est[- ]?ce\s+qui\s+est\s+(?:actif|connect[ée]|disponible)|es[- ]?tu\s+capable|ton\s+propre\s+code|ta\s+version|comment\s+fonctionnes[- ]?tu)\b/i;

function extractText(result) {
  if (typeof result === 'string') return result;
  return result?.response ?? result?.text ?? result?.result?.response ?? result?.choices?.[0]?.message?.content ?? null;
}

export function isSelfStateQuestion(text) {
  const value = String(text || '').trim();
  return Boolean(value && value.length <= SELF_STATE_MAX_CHARS && SELF_STATE_INTENT.test(value));
}

async function recentContext(env, conversationId) {
  if (!env?.DB || !conversationId) return [];
  try {
    const rows = await env.DB.prepare(`SELECT role,content FROM archive_messages
      WHERE conversation_id=? AND role IN ('user','assistant')
      ORDER BY timestamp DESC,id DESC LIMIT ?`)
      .bind(conversationId, CONTEXT_MESSAGES).all();
    return (rows.results || []).reverse().map(row => ({
      role: row.role === 'assistant' ? 'assistant' : 'user',
      content: String(row.content || '').slice(0, 5000),
    }));
  } catch {
    return [];
  }
}

async function persist(env, { conversationId, deviceId, text, answer, elapsedMs }) {
  if (!env?.DB || !conversationId) return false;
  try {
    const service = createConversationService(env);
    await service.archiveMessage({ conversationId, deviceId, role: 'user', content: text, provenance: 'self-aware-chat', metadata: { self_aware: true } });
    await service.archiveMessage({ conversationId, deviceId, role: 'assistant', content: answer, model: MODEL, provenance: 'self-aware-chat', metadata: { self_aware: true, latency_ms: elapsedMs } });
    return true;
  } catch (error) {
    console.warn('[self-aware-chat] archive failed', error?.message || error);
    return false;
  }
}

export async function maybeHandleSelfAwarenessApi(request, env) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname !== '/api/gen2/self-awareness') return null;
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  const snapshot = await getSelfAwarenessSnapshot(env, { full: true, force: url.searchParams.get('refresh') === '1' });
  return Response.json({ ok: true, ...snapshot }, { headers: { 'cache-control': 'no-store' } });
}

/** Ground direct questions about MEL herself in live structured state. */
export async function maybeHandleSelfAwareChat(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/chat' || request.method !== 'POST') return null;
  if (!(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) return null;
  if (!env?.AI || typeof env.AI.run !== 'function') return null;

  let body;
  try { body = await request.clone().json(); }
  catch { return null; }
  if (body?.capability?.id) return null;

  const text = String(body?.text || '').trim();
  if (!isSelfStateQuestion(text)) return null;

  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;

  const conversationId = String(body?.conversation_id || '').slice(0, 200);
  const deviceId = String(body?.device_id || '').slice(0, 200) || null;
  const theme = ['classic', 'crusade', 'religious'].includes(body?.ui_theme) ? body.ui_theme : 'classic';
  const [systemContext, history] = await Promise.all([
    selfAwarenessSystemContext(env, { full: true, theme }),
    recentContext(env, conversationId),
  ]);

  const messages = [
    {
      role: 'system',
      content: [
        'Tu es MEL. Réponds à la question sur TON propre état à partir du contexte système structuré ci-dessous, jamais à partir d’une supposition.',
        'Ne récite pas tout le JSON. Réponds directement à ce qui est demandé, puis donne les distinctions utiles.',
        'Si on te demande ce que tu fais actuellement, cite le ou les jobs actifs réels. S’il n’y en a aucun, dis-le clairement.',
        'Si on te demande tes capacités, distingue ce qui est enregistré/configuré de ce qui est seulement dans la roadmap.',
        'N’appelle jamais HEALTHY une preuve d’exécution récente. N’invente ni connexion, ni test, ni déploiement.',
        systemContext,
      ].join('\n'),
    },
    ...history,
    { role: 'user', content: text },
  ];

  const started = Date.now();
  try {
    const result = await env.AI.run(MODEL, { messages, temperature: 0.15, max_tokens: 1200 });
    const answer = String(extractText(result) || '').trim();
    if (!answer) return null;
    const elapsedMs = Date.now() - started;
    const save = persist(env, { conversationId, deviceId, text, answer, elapsedMs });
    let archiveSaved = null;
    if (ctx?.waitUntil) ctx.waitUntil(save);
    else archiveSaved = await save;
    return Response.json({
      ok: true,
      text: answer,
      model: MODEL,
      self_aware: true,
      latency_ms: elapsedMs,
      archive_saved: archiveSaved,
    }, { headers: { 'cache-control': 'no-store', 'x-mel-self-aware': '1' } });
  } catch (error) {
    console.warn('[self-aware-chat] fallback to normal router', error?.message || error);
    return null;
  }
}

// Live self-test of MEL Chat, run inside the deployed Worker.
//
// POST /api/internal/chat-selftest  — only with the per-deployment proof key
// (x-mel-release-smoke + x-mel-parallel-proof). It calls the REAL chat handler
// in-process as the owner (streaming enabled, same pipeline as the browser) and
// returns measurements only: time to first text, duration, length, model,
// whether it streamed, whether it was archived, and a short excerpt.
import { createConversationService } from '../conversations/conversation-service.js';

const CONNECTED_READS = ['gmail.messages.search', 'calendar.events.read', 'drive.files.list'];
const safeCode = value => /^[A-Z][A-Z0-9_]{0,159}$/.test(String(value || '')) ? String(value) : null;

async function connectedReadsSelftest({ origin, password, env, handleChat, chatOptions }) {
  const started = Date.now();
  const conversationId = 'selftest-connected-' + crypto.randomUUID();
  const clientMessageId = 'connected-read-proof-1';
  const text = 'Lis mes cinq derniers messages Gmail, mon agenda Google et mes fichiers Google Drive. Exécute les trois lectures et donne leur résultat exact.';
  const call = () => handleChat(new Request(origin + '/api/chat', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + password, 'content-type': 'application/json' },
    body: JSON.stringify({ text, conversation_id: conversationId, client_message_id: clientMessageId, stream: false }),
  }), env, chatOptions);
  try {
    const firstResponse = await call();
    const first = await firstResponse.json();
    const rows = Array.isArray(first.tool_results) ? first.tool_results : [];
    const connectors = CONNECTED_READS.map(id => {
      const matches = rows.filter(row => row?.capability === id);
      const row = matches[0];
      const codes = [row?.error, row?.native_code, row?.fallback_code].map(safeCode).filter(Boolean);
      const succeeded = matches.length === 1 && row?.status === 'SUCCEEDED';
      const authFailure = matches.length === 1 && row?.status === 'FAILED'
        && codes.some(code => /(?:AUTH|OAUTH|TOKEN|CONSENT|ACCOUNT_REQUIRED|SCOPE)/.test(code));
      return { capability: id, status: row?.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED',
        codes, executed: matches.length === 1, ok: succeeded || authFailure };
    });
    const reply = String(first.text || '');
    const responseIsText = reply.trim().length > 0 && !/^\s*[\[{]/.test(reply)
      && !/"(?:tool_calls|function_call|arguments)"\s*:/.test(reply);
    const replayResponse = await call();
    const replay = await replayResponse.json();
    const replayVerified = replayResponse.status === 200 && replay.replayed === true
      && replay.archive_saved === true && replay.text === reply
      && Array.isArray(replay.tool_results) && replay.tool_results.length === 0;
    const messages = await createConversationService({ DB: env.DB }).getMessages(conversationId);
    const archivedOnce = messages.length === 2
      && ['user', 'assistant'].every(role => messages.filter(message => message.role === role
        && message.metadata?.client_message_id === clientMessageId).length === 1);
    return { case: 'connected_reads',
      ok: connectors.every(row => row.ok) && responseIsText && replayVerified && archivedOnce,
      status: firstResponse.status, connectors, response_is_text: responseIsText,
      replay_verified: replayVerified, archive_exactly_one_turn: archivedOnce,
      archived: first.archive_saved === true, total_ms: Date.now() - started,
      private_content_logged: false };
  } catch (error) {
    return { case: 'connected_reads', ok: false, error: safeCode(error?.code) || 'CONNECTED_READ_SELFTEST_FAILED',
      total_ms: Date.now() - started, private_content_logged: false };
  }
}

const CASES = Object.freeze({
  short: () => ({ text: 'Bonjour MEL. En une seule phrase : qui es-tu et que peux-tu faire pour moi ?', expect: /mel/i }),
  plan: () => ({ text: 'Établis un plan d’action en 5 étapes numérotées pour lancer une petite activité de traduction en ligne. Pour chaque étape : objectif, actions concrètes, durée estimée.', expect: /(^|\n)\s*(?:#+\s*)?(?:\*\*)?(?:étape\s*)?5\b/im }),
  // MEL must know her real tools: no "I have no network / PC / execution",
  // and no request for keys she does not need.
  capabilities: () => ({
    text: 'MEL, liste précisément ce que tu peux faire toi-même aujourd’hui (réseau, recherche web, fichiers, PC Windows, exécution, MINI, téléphone, MEL WORK, travail en arrière-plan) et ce qui te manque vraiment pour travailler de bout en bout.',
    expect: /(companion|ton pc|pc windows)/i,
    reject: /aucun (?:accès réseau|navigateur|moteur d.exécution|accès à un os)|pas (?:d.|de )accès (?:au |à )?(?:internet|réseau|web)|SEARCH_API_KEY|COMPANION_TOKEN|ne (?:peux|pourrai) pas (?:poursuivre|travailler) en arrière-plan|uniquement à la demande/i,
    excerptChars: 1500,
  }),
  big: () => bigPrompt(38_000),
  huge: () => bigPrompt(90_000),
});

// A long document with one fact buried in the middle: answering proves the
// whole prompt was read, not just its beginning or end.
function bigPrompt(targetChars) {
  const sections = [];
  let i = 1;
  let size = 0;
  const middle = Math.floor(targetChars / 2);
  let planted = false;
  while (size < targetChars) {
    let body = `Section ${i}. Rapport d’activité : l’équipe a analysé les retours clients, ajusté les priorités du trimestre, documenté les incidents mineurs et préparé les jalons suivants. Aucun point bloquant n’a été relevé dans cette section, les indicateurs restent stables et conformes aux prévisions.`;
    if (!planted && size >= middle) { body += ' Information importante : le code de validation du projet est ORCHIDEE-7342.'; planted = true; }
    sections.push(body);
    size += body.length + 1;
    i += 1;
  }
  return {
    text: 'Voici un long document de travail. Lis-le entièrement.\n\n' + sections.join('\n') + '\n\nQuestion : quel est le code de validation du projet mentionné dans le document, et combien de sections environ contient-il ? Réponds en deux phrases.',
    expect: /ORCHIDEE-7342/i,
  };
}

async function readChatResponse(response, startedAt) {
  const type = response.headers.get('content-type') || '';
  if (!type.includes('application/x-ndjson') || !response.body) {
    const data = await response.json().catch(() => ({}));
    const text = String(data?.reply || data?.response || data?.text || data?.message || '');
    return { streamed: false, status: response.status, text, firstTextMs: text ? Date.now() - startedAt : null, model: data?.model || null, archived: data?.archive_saved === true, error: data?.code || data?.error || null };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let firstTextMs = null;
  let done = null;
  let failure = null;
  let deltas = 0;
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    buffer += decoder.decode(value, { stream: true });
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (!line.trim()) continue;
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      if (event.type === 'delta') {
        if (firstTextMs === null) firstTextMs = Date.now() - startedAt;
        text += String(event.text || '');
        deltas += 1;
      } else if (event.type === 'done') done = event;
      else if (event.type === 'error') failure = event;
    }
  }
  return { streamed: true, status: response.status, text, firstTextMs, deltas, model: done?.model || null, archived: done?.archived === true, truncated: done?.truncated === true, error: failure?.code || null };
}

export async function runChatSelftest({ request, env, handleChat, chatOptions = {}, cases = ['short', 'plan', 'big', 'huge'] }) {
  const origin = new URL(request.url).origin;
  const password = String(env.MELITURGOS_PASSWORD || '');
  if (!password) return Response.json({ ok: false, code: 'OWNER_AUTH_NOT_CONFIGURED' }, { status: 503 });
  const results = [];
  for (const name of cases.filter(name => CASES[name] || name === 'connected_reads').slice(0, 5)) {
    if (name === 'connected_reads') {
      results.push(await connectedReadsSelftest({ origin, password, env, handleChat, chatOptions }));
      continue;
    }
    const { text, expect, reject = null, excerptChars = 280 } = CASES[name]();
    const startedAt = Date.now();
    let outcome;
    try {
      const chatRequest = new Request(origin + '/api/chat', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + password, 'content-type': 'application/json', accept: 'application/x-ndjson, application/json' },
        body: JSON.stringify({ text, message: text, conversation_id: 'selftest-' + name + '-' + startedAt, stream: true }),
      });
      outcome = await readChatResponse(await handleChat(chatRequest, env, chatOptions), startedAt);
    } catch (error) {
      outcome = { streamed: false, status: 0, text: '', error: String(error?.code || error?.message || 'SELFTEST_CALL_FAILED').slice(0, 120) };
    }
    results.push({
      case: name,
      prompt_chars: text.length,
      ok: outcome.status === 200 && !outcome.error && outcome.text.trim().length > 0 && expect.test(outcome.text) && !(reject && reject.test(outcome.text)),
      understood: expect.test(outcome.text) && !(reject && reject.test(outcome.text)),
      wrong_claim: reject ? (outcome.text.match(reject)?.[0] || null) : null,
      streamed: outcome.streamed,
      status: outcome.status,
      first_text_ms: outcome.firstTextMs ?? null,
      total_ms: Date.now() - startedAt,
      reply_chars: outcome.text.length,
      deltas: outcome.deltas ?? null,
      model: outcome.model,
      archived: outcome.archived === true,
      truncated: outcome.truncated === true,
      error: outcome.error,
      excerpt: outcome.text.replace(/\s+/g, ' ').trim().slice(0, excerptChars),
    });
  }
  return Response.json({ ok: results.length > 0 && results.every(r => r.ok), results }, { headers: { 'cache-control': 'no-store' } });
}

export const CHAT_SELFTEST_CASES = [...Object.keys(CASES), 'connected_reads'];

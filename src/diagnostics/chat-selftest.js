// Live self-test of MEL Chat, run inside the deployed Worker.
//
// POST /api/internal/chat-selftest  — only with the per-deployment proof key
// (x-mel-release-smoke + x-mel-parallel-proof). It calls the REAL chat handler
// in-process as the owner (streaming enabled, same pipeline as the browser) and
// returns measurements only: time to first text, duration, length, model,
// whether it streamed, whether it was archived, and a short excerpt.

import { DEFAULT_DAILY_NEURON_CAP } from '../augmentio/neuron-budget.js';

const PROVIDER_DIAGNOSTIC_CODES = [
  'WORKERS_AI_DAILY_NEURON_BUDGET_EXHAUSTED', 'WORKERS_AI_NEURON_BUDGET_UNAVAILABLE',
  'CHAT_DEADLINE_EXCEEDED', 'CHAT_FALLBACK_TIMEOUT', 'CHAT_FALLBACK_EMPTY',
  'CHAT_PROVIDER_TIMEOUT', 'ZERO_COST_PROVIDER_REQUIRED',
];

// Read the existing application's estimated counter; never reset it, create a
// table, or present it as a Cloudflare billing/usage measurement.
export async function readChatBudgetEvidence(env, { now = Date.now() } = {}) {
  const unavailable={available:false,code:'CHAT_AI_BUDGET_UNAVAILABLE'};
  if(!env?.DB?.prepare)return unavailable;
  try {
    const day=new Date(now).toISOString().slice(0,10);
    const row=await env.DB.prepare('SELECT neurons,calls,refused FROM mel_ai_neuron_budget WHERE day=?').bind(day).first();
    if(row&&['neurons','calls','refused'].some(key=>typeof row[key]!=='number'))return unavailable;
    const values={neurons:Number(row?.neurons??0),calls:Number(row?.calls??0),refused:Number(row?.refused??0)};
    if(Object.values(values).some(value=>!Number.isFinite(value)||value<0))return unavailable;
    const cap=Number(env.MEL_AI_DAILY_NEURON_CAP)>0?Number(env.MEL_AI_DAILY_NEURON_CAP):DEFAULT_DAILY_NEURON_CAP;
    if(!Number.isFinite(cap))return unavailable;
    return {available:true,source:'MEL_ESTIMATED_NEURON_COUNTER',day,cap,...values,exhausted:values.neurons>=cap,
      reset_at:new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString(),billing_verified:false};
  } catch {return unavailable;}
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
    return { streamed: false, status: response.status, text, firstTextMs: text ? Date.now() - startedAt : null, model: data?.model || null, archived: data?.archive_saved === true, error: data?.code || data?.error || null,
      providerError:PROVIDER_DIAGNOSTIC_CODES.find(code=>String(data?.detail||'').includes(code))||null };
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
  for (const name of cases.filter(name => CASES[name]).slice(0, 5)) {
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
      provider_error: outcome.providerError || null,
      excerpt: outcome.text.replace(/\s+/g, ' ').trim().slice(0, excerptChars),
    });
  }
  return Response.json({ ok: results.length > 0 && results.every(r => r.ok), results, ai_budget:await readChatBudgetEvidence(env) }, { headers: { 'cache-control': 'no-store' } });
}

export const CHAT_SELFTEST_CASES = Object.keys(CASES);

// Réponses longues en flux continu pour MEL Chat.
//
// Sans flux, le navigateur attend la réponse complète d'un seul bloc : une
// réponse longue (plusieurs milliers de tokens) dépasse alors son délai et
// l'utilisateur ne voit que « Réponse serveur trop lente ». Ici, chaque morceau
// de texte produit par Workers AI est relayé immédiatement au navigateur en
// NDJSON ; l'échange est archivé une fois la réponse terminée.
//
// Format émis (une ligne JSON par événement) :
//   {"type":"start","model":"…"}
//   {"type":"delta","text":"…"}            (répété)
//   {"type":"done","model":"…","chars":N,"archived":true,"truncated":false}
//   {"type":"error","code":"…","partial_chars":N}

import { extractModelText } from '../models/ModelRouter.js';

const encoder = new TextEncoder();

// Modèles du chat en flux, du plus capable au plus économe. Tous gratuits dans le
// quota Workers AI (DeepSeek V4 / Kimi exigent un plan payant : exclus).
// gpt-oss-120b : 120B, raisonnement, ≈128k tokens de contexte, sortie 3× moins
// chère en neurones que llama-3.3-70b. Les suivants servent de secours.
export const STREAM_MODELS = Object.freeze([
  { id: '@cf/openai/gpt-oss-120b', maxInputChars: 360_000 },
  // Nemotron 3 Super (NVIDIA, 120B MoE, long context) : second choix gratuit.
  { id: '@cf/nvidia/nemotron-3-120b-a12b', maxInputChars: 360_000 },
  { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', maxInputChars: 48_000 },
  { id: '@cf/google/gemma-4-26b-a4b-it', maxInputChars: 360_000 },
]);

export function messagesChars(messages) {
  return (Array.isArray(messages) ? messages : []).reduce((sum, m) => sum + String(m?.content || '').length, 0);
}

// Ordre d'essai pour cette requête : un modèle forcé, sinon tous ceux dont le
// contexte suffit (le dernier reste toujours en secours).
export function streamModelCandidates(messages, env = {}, order = null) {
  const forced = String(env?.MEL_STREAM_MODEL || '').trim();
  if (forced) return [forced];
  const size = messagesChars(messages);
  // `order` = latest nightly tournament ranking (src/models/model-tournament.js);
  // without it, the static order above applies.
  const known = new Map(STREAM_MODELS.map(model => [model.id, model.maxInputChars]));
  const ids = Array.isArray(order) && order.length ? order : STREAM_MODELS.map(model => model.id);
  const fit = ids.filter(id => size <= (known.get(id) ?? 100_000));
  return fit.length ? fit : [STREAM_MODELS[STREAM_MODELS.length - 1].id];
}

export function selectStreamModel(messages, env = {}) {
  return streamModelCandidates(messages, env)[0];
}

export function streamOutputTokens(env = {}) {
  const configured = Number(env?.MEL_STREAM_MAX_OUTPUT_TOKENS);
  return Math.max(512, Math.min(16_000, Number.isFinite(configured) && configured > 0 ? configured : 8_192));
}

// Extrait le texte d'un événement SSE Workers AI, quel que soit le format du modèle.
export function sseEventText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const choice = Array.isArray(payload.choices) ? payload.choices[0] : null;
  // Streaming deltas take precedence; full-provider fields use the same
  // nonempty text contract as sequential and parallel MEL Core inference.
  if (typeof choice?.delta?.content === 'string' && choice.delta.content) return choice.delta.content;
  return extractModelText(payload) || '';
}

function sseFinishReason(payload) {
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
  return choice?.finish_reason || payload?.finish_reason || null;
}

// Parcourt un flux SSE (octets) et appelle onText pour chaque morceau de texte.
export async function readWorkersAiSse(stream, { onText, onFinish, idleTimeoutMs = 0, firstTextTimeoutMs = 0, hasVisibleText = () => false } = {}) {
  const reader = stream.getReader();
  const firstTextDeadline = firstTextTimeoutMs > 0 ? Date.now() + firstTextTimeoutMs : 0;
  const decoder = new TextDecoder();
  let buffer = '';
  let finishReason = null;
  const handleLine = line => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return false;
    const data = trimmed.slice(5).trim();
    if (!data) return false;
    if (data === '[DONE]') return true;
    let payload;
    try { payload = JSON.parse(data); } catch { return false; }
    // Do not swallow callbacks' timeout/errors as malformed provider JSON.
    // The caller must be able to fail over when a model produces no answer.
    const text = sseEventText(payload);
    if (text) onText?.(text);
    finishReason = sseFinishReason(payload) || finishReason;
    return false;
  };
  try {
    for (;;) {
      let timer;
      const awaitingVisibleText = firstTextDeadline > 0 && !hasVisibleText();
      const remainingFirstTextMs = awaitingVisibleText ? firstTextDeadline - Date.now() : Infinity;
      if (remainingFirstTextMs <= 0) throw Object.assign(new Error('MODEL_NO_VISIBLE_TEXT'), { code:'MODEL_NO_VISIBLE_TEXT' });
      const waitMs = Math.min(idleTimeoutMs > 0 ? idleTimeoutMs : Infinity, remainingFirstTextMs);
      const { value, done } = await (Number.isFinite(waitMs)
        ? Promise.race([
            reader.read(),
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(Object.assign(new Error(awaitingVisibleText && remainingFirstTextMs <= (idleTimeoutMs || Infinity) ? 'MODEL_NO_VISIBLE_TEXT' : 'MODEL_STREAM_IDLE_TIMEOUT'), { code:awaitingVisibleText && remainingFirstTextMs <= (idleTimeoutMs || Infinity) ? 'MODEL_NO_VISIBLE_TEXT' : 'MODEL_STREAM_IDLE_TIMEOUT' })), Math.max(1, waitMs));
            }),
          ]).finally(() => clearTimeout(timer))
        : reader.read());
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        if (handleLine(line)) { onFinish?.(finishReason); return; }
      }
    }
    if (buffer) handleLine(buffer);
    onFinish?.(finishReason);
  } catch (error) {
    // Cancel a stalled upstream reader before moving to the next provider.
    void reader.cancel().catch(() => {});
    throw error;
  }
}

// The stream path offers the model no tools. gpt-oss still sometimes "calls"
// one in plain text ({"tool":"code.search",…}), narrates its reasoning in
// English ("We need to see TOOL_RESULT.") and then claims actions it never
// ran. The note forbids it; the filter removes what slips through.
export const STREAM_NO_TOOLS_NOTE = 'DANS CETTE RÉPONSE TU N’AS AUCUN OUTIL À APPELER : n’écris jamais d’appel d’outil en JSON ("tool": …), de TOOL_RESULT, ni ton raisonnement interne. Ne prétends jamais avoir lancé, déclenché, modifié ou déployé quoi que ce soit pendant cette réponse : aucune action n’a été exécutée. Si une action est nécessaire, dis précisément laquelle et ce qui la prouvera.';

export function withNoToolsNote(messages) {
  const list = Array.isArray(messages) ? messages.slice() : [];
  const i = list.findIndex(m => m?.role === 'system');
  if (i >= 0) list[i] = { ...list[i], content: String(list[i].content || '') + ' ' + STREAM_NO_TOOLS_NOTE };
  else list.unshift({ role: 'system', content: STREAM_NO_TOOLS_NOTE });
  return list;
}

const REASONING_STARTER = /^\s*(?:We|Let's|Let us|Attempt|Attempting|Possibly|Maybe|Might|Given|But we|Now we|Need to|I need|I should|Search(?:ing)? (?:code|the)|The user|Should|So we|Probably)\b/;
const FRENCH = /[àâçéèêëîïôûùüÿœ«»’]|\b(?:je|tu|il|elle|le|la|les|des|est|pas|pour|avec|une|dans|mon|ton|sur|qui|que)\b/i;

function closingBrace(text) {
  let depth = 0, inString = false, escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}' && --depth === 0) return i;
  }
  return -1;
}

/** Stateful filter: push(text) → text safe to show; flush() at the end. */
export function createToolLeakFilter({ holdLimit = 4000 } = {}) {
  let buf = '';
  let answerStarted = false;
  let dropped = 0;
  const sentences = (text, final) => {
    // Before the real (French) answer begins, English agent narration is dropped
    // sentence by sentence; afterwards text passes unchanged.
    if (answerStarted) return text;
    let out = '';
    let rest = text;
    for (;;) {
      const m = /[.!?\n:](?=\s|$|[A-Z{À-Ý])/.exec(rest);
      if (!m) break;
      const sentence = rest.slice(0, m.index + 1);
      rest = rest.slice(m.index + 1);
      if (!answerStarted && REASONING_STARTER.test(sentence) && !FRENCH.test(sentence)) { dropped += 1; continue; }
      if (sentence.trim()) answerStarted = answerStarted || FRENCH.test(sentence);
      out += sentence;
      if (answerStarted) { out += rest; rest = ''; break; }
    }
    if (final || answerStarted) {
      if (!answerStarted && REASONING_STARTER.test(rest) && !FRENCH.test(rest)) { dropped += 1; rest = ''; }
      return out + rest;
    }
    pending = rest + pending;
    return out;
  };
  let pending = '';
  const drain = final => {
    let out = '';
    for (;;) {
      const start = buf.indexOf('{');
      if (start < 0) { out += buf; buf = ''; break; }
      out += buf.slice(0, start);
      buf = buf.slice(start);
      const end = closingBrace(buf);
      if (end < 0) {
        if (final || buf.length > holdLimit) { out += buf; buf = ''; }
        break;
      }
      const block = buf.slice(0, end + 1);
      buf = buf.slice(end + 1);
      if (/^\{\s*"(?:tool|action|name|function)"\s*:/.test(block) && /"tool"\s*:|"function"\s*:/.test(block)) { dropped += 1; continue; }
      out += block;
    }
    const text = pending + out;
    pending = '';
    return sentences(text, final);
  };
  return {
    push(text) { buf += String(text || ''); return drain(false); },
    flush() { return drain(true); },
    get dropped() { return dropped; },
  };
}

/**
 * Lance l'inférence en flux et renvoie la Response NDJSON.
 * `archive(fullText, meta)` est appelé une fois la réponse terminée (ou
 * interrompue avec du texte partiel) ; il doit renvoyer true si l'archivage a réussi.
 */
export function streamChatResponse({ env, messages, archive = async () => false, model = null, localFallback = null, modelOrder = null } = {}) {
  const candidates = model ? [model] : streamModelCandidates(messages, env, modelOrder);
  const maxTokens = streamOutputTokens(env);
  let fullText = '';
  let usedModel = candidates[0];
  const body = new ReadableStream({
    async start(controller) {
      const send = event => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      send({ type: 'start', model: usedModel });
      let finishReason = null;
      let lastError = null;
      try {
        // Un modèle qui échoue AVANT d'avoir écrit quoi que ce soit est remplacé par le
        // suivant, sans que l'utilisateur ne voie d'erreur. Une fois du texte envoyé,
        // on ne change plus de modèle.
        for (const candidate of candidates) {
          if (fullText) break;
          if (candidate !== usedModel) send({ type: 'model', model: candidate, fallback_from: usedModel, reason: lastError });
          usedModel = candidate;
          try {
            const modelAttemptStarted = Date.now();
            const filter = createToolLeakFilter();
            const emit = text => { if (text) { fullText += text; send({ type: 'delta', text }); } };
            // A silent provider must not occupy the 45-second browser idle
            // window. Give it 28 seconds to produce visible text, then fail
            // over using the existing ranked model list.
            let startupTimer;
            const source = await Promise.race([
              Promise.resolve().then(() => env.AI.run(candidate, { messages: withNoToolsNote(messages), stream: true, max_tokens: maxTokens })),
              new Promise((_, reject) => {
                startupTimer = setTimeout(() => reject(Object.assign(new Error('MODEL_STREAM_START_TIMEOUT'), { code:'MODEL_STREAM_START_TIMEOUT' })), 28000);
              }),
            ]).finally(() => clearTimeout(startupTimer));
            if (!source || typeof source.getReader !== 'function') {
              emit(filter.push(sseEventText(source) || String(source?.result?.response || '')));
            } else {
              await readWorkersAiSse(source, {
                idleTimeoutMs: 28000,
                firstTextTimeoutMs: Math.max(1, 28000 - (Date.now() - modelAttemptStarted)),
                hasVisibleText: () => Boolean(fullText.trim()),
                onText: text => emit(filter.push(text)),
                onFinish: reason => { finishReason = reason; },
              });
            }
            emit(filter.flush());
            if (!fullText.trim()) lastError = 'EMPTY_MODEL_RESPONSE';
          } catch (error) {
            lastError = String(error?.code || error?.message || 'STREAM_FAILED').slice(0, 120);
            if (fullText) throw error;
          }
        }
        // Aucun modèle cloud n'a pu répondre (quota, panne, délai) : le modèle local
        // du PC d'Adrien prend le relais si le Companion est en ligne et autorisé.
        if (!fullText.trim() && typeof localFallback === 'function') {
          send({ type: 'model', model: 'pc-local', fallback_from: usedModel, reason: lastError });
          const local = await localFallback(messages).catch(error => ({ ok: false, code: String(error?.message || 'LOCAL_FAILED') }));
          if (local?.ok && local.text) { usedModel = local.model || 'pc-local'; fullText = local.text; send({ type: 'delta', text: local.text }); }
          else lastError = lastError || local?.code || 'LOCAL_FAILED';
        }
        if (!fullText.trim()) throw Object.assign(new Error(lastError || 'EMPTY_MODEL_RESPONSE'), { code: lastError || 'EMPTY_MODEL_RESPONSE' });
        const truncated = finishReason === 'length';
        let archived = false;
        try { archived = await archive(fullText, { model: usedModel, truncated }); } catch {}
        send({ type: 'done', model: usedModel, chars: fullText.length, archived: archived === true, truncated });
      } catch (error) {
        const code = String(error?.code || error?.message || 'STREAM_FAILED').slice(0, 120);
        if (fullText.trim()) {
          try { await archive(fullText, { model: usedModel, truncated: true, error: code }); } catch {}
        }
        send({ type: 'error', code, partial_chars: fullText.length });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      'x-mel-stream-model': candidates[0],
    },
  });
}

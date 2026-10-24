import { hasLeakedToolProtocol } from './agent-tools.js';
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
export function streamModelCandidates(messages, env = {}, order = null, { ignoreConfiguredModel = false } = {}) {
  const forced = ignoreConfiguredModel ? '' : String(env?.MEL_STREAM_MODEL || '').trim();
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
export async function readWorkersAiSse(stream, { onText, onFinish } = {}) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finishReason = null;
  const handleLine = line => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return false;
    const data = trimmed.slice(5).trim();
    if (!data) return false;
    if (data === '[DONE]') return true;
    try {
      const payload = JSON.parse(data);
      const text = sseEventText(payload);
      if (text) onText?.(text);
      finishReason = sseFinishReason(payload) || finishReason;
    } catch {}
    return false;
  };
  for (;;) {
    const { value, done } = await reader.read();
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
}

// The stream path offers the model no tools. gpt-oss still sometimes "calls"
// one in plain text ({"tool":"code.search",…}), narrates its reasoning in
// English ("We need to see TOOL_RESULT.") and then claims actions it never
// ran. The note forbids it; the filter removes what slips through.
export const STREAM_NO_TOOLS_NOTE = 'DANS CETTE RÉPONSE TU N’AS AUCUN OUTIL À APPELER : n’écris jamais d’appel d’outil en JSON ("tool": …), de TOOL_RESULT, ni ton raisonnement interne. Ne prétends jamais avoir lancé, déclenché, modifié ou déployé quoi que ce soit pendant cette réponse : aucune action n’a été exécutée. Si une action est nécessaire, dis précisément laquelle et ce qui la prouvera.';

/** The stream path cannot execute a tool. An action request stays on the full path. */
export function plainChatMayStream({ stream, voice, releaseSmoke, parallel, personalProfile, toolCount, actionRequest, adapter, ai } = {}) {
  return stream === true && voice !== true && releaseSmoke !== true && parallel !== true
    && personalProfile !== true && Number(toolCount) === 0 && actionRequest !== true
    && adapter == null && ai === true;
}

export function withNoToolsNote(messages, {preserveToolExamples=false} = {}) {
  const note=preserveToolExamples
    ? 'DANS CETTE RÉPONSE TU N’AS AUCUN OUTIL À APPELER. Les représentations JSON ou le code d’outils explicitement demandés comme exemples sont autorisés comme données. Aucun exemple ne doit être exécuté ou présenté comme une action réellement effectuée. Ne fournis pas de raisonnement interne ni de faux TOOL_RESULT.'
    : STREAM_NO_TOOLS_NOTE;
  const list = Array.isArray(messages) ? messages.slice() : [];
  const i = list.findIndex(m => m?.role === 'system');
  if (i >= 0) list[i] = { ...list[i], content: String(list[i].content || '') + ' ' + note };
  else list.unshift({ role: 'system', content: note });
  return list;
}

const REASONING_STARTER = /^\s*(?:We|Let's|Let us|Attempt|Attempting|Possibly|Maybe|Might|Given|But we|Now we|Need to|I need|I should|Search(?:ing)? (?:code|the)|The user|Should|So we|Probably)\b/;
const FRENCH = /[àâçéèêëîïôûùüÿœ«»’]|\b(?:je|tu|il|elle|le|la|les|des|est|pas|pour|avec|une|dans|mon|ton|sur|qui|que)\b/i;

function scanObject(text, state = {depth:0,inString:false,escaped:false}) {
  let {depth,inString,escaped}=state;
  for (let i=0;i<text.length;i++) {
    const ch=text[i];
    if (inString) {
      if (escaped) escaped=false;
      else if (ch==='\\') escaped=true;
      else if (ch==='"') inString=false;
    } else if (ch==='"') inString=true;
    else if (ch==='{') depth++;
    else if (ch==='}' && --depth===0) return {end:i,state:{depth,inString,escaped}};
  }
  return {end:-1,state:{depth,inString,escaped}};
}

/** Stateful filter: push(text) → text safe to show; flush() at the end. */
export function createToolLeakFilter({ holdLimit = 4000, preserveToolExamples = false } = {}) {
  let buf = '';
  let answerStarted = false;
  let dropped = 0;
  let droppingState = null;
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
      if (droppingState) {
        const skipped=scanObject(buf,droppingState);
        if (skipped.end<0) {droppingState=final ? null : skipped.state;buf='';break;}
        buf=buf.slice(skipped.end+1);droppingState=null;continue;
      }
      const start = buf.indexOf('{');
      if (start < 0) { out += buf; buf = ''; break; }
      out += buf.slice(0, start);
      buf = buf.slice(start);
      const scanned=scanObject(buf),end=scanned.end;
      if (end < 0) {
        if (final || buf.length > holdLimit) {
          if (!preserveToolExamples && hasLeakedToolProtocol(buf)) {
            dropped++;droppingState=final ? null : scanned.state;
          } else out+=buf;
          buf='';
        }
        break;
      }
      const block = buf.slice(0, end + 1);
      buf = buf.slice(end + 1);
      if (!preserveToolExamples && hasLeakedToolProtocol(block)) { dropped += 1; continue; }
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
export function streamChatResponse({ env, messages, archive = async () => false, model = null, localFallback = null, modelOrder = null, preferredModel = null, verifyCompletedText = null, preserveToolExamples = false } = {}) {
  // A Professor-only preference must take precedence over the global chat model
  // without affecting ordinary Normal chat or disabling bounded fallbacks.
  const preferred = String(preferredModel || '').trim();
  const roleCandidates = preferred
    ? streamModelCandidates(messages, env, modelOrder, { ignoreConfiguredModel: true })
    : null;
  const candidates = model ? [model] : preferred
    ? (roleCandidates.includes(preferred)
      ? [preferred, ...roleCandidates.filter(id => id !== preferred)]
      : roleCandidates)
    : streamModelCandidates(messages, env, modelOrder);
  // Code replies keep the NDJSON transport but withhold model deltas until the
  // complete reply has passed the same D1 execution-receipt guard as JSON chat.
  const gated = typeof verifyCompletedText === 'function';
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
            const filter = createToolLeakFilter({preserveToolExamples});
            const emit = text => { if (text) { fullText += text; if (!gated) send({ type: 'delta', text }); } };
            const source = await env.AI.run(candidate, { messages: withNoToolsNote(messages,{preserveToolExamples}), stream: true, max_tokens: maxTokens });
            if (!source || typeof source.getReader !== 'function') {
              emit(filter.push(sseEventText(source) || String(source?.result?.response || '')));
            } else {
              await readWorkersAiSse(source, {
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
          if (local?.ok && local.text) { usedModel = local.model || 'pc-local'; fullText = local.text; if (!gated) send({ type: 'delta', text: local.text }); }
          else lastError = lastError || local?.code || 'LOCAL_FAILED';
        }
        if (!fullText.trim()) throw Object.assign(new Error(lastError || 'EMPTY_MODEL_RESPONSE'), { code: lastError || 'EMPTY_MODEL_RESPONSE' });
        if (gated) {
          const safeText = String(await verifyCompletedText(fullText) || '').trim();
          if (!safeText) throw Object.assign(new Error('STREAM_VERIFICATION_EMPTY'), { code:'STREAM_VERIFICATION_EMPTY' });
          fullText = safeText;
          send({ type: 'delta', text: fullText });
        }
        const truncated = finishReason === 'length';
        let archived = false;
        try { archived = await archive(fullText, { model: usedModel, truncated }); } catch {}
        send({ type: 'done', model: usedModel, chars: fullText.length, archived: archived === true, truncated });
      } catch (error) {
        const code = String(error?.code || error?.message || 'STREAM_FAILED').slice(0, 120);
        if (fullText.trim() && !gated) {
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

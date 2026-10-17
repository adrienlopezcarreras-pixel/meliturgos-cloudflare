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
export function streamModelCandidates(messages, env = {}) {
  const forced = String(env?.MEL_STREAM_MODEL || '').trim();
  if (forced) return [forced];
  const size = messagesChars(messages);
  const fit = STREAM_MODELS.filter(model => size <= model.maxInputChars).map(model => model.id);
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

/**
 * Lance l'inférence en flux et renvoie la Response NDJSON.
 * `archive(fullText, meta)` est appelé une fois la réponse terminée (ou
 * interrompue avec du texte partiel) ; il doit renvoyer true si l'archivage a réussi.
 */
export function streamChatResponse({ env, messages, archive = async () => false, model = null, localFallback = null } = {}) {
  const candidates = model ? [model] : streamModelCandidates(messages, env);
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
            const source = await env.AI.run(candidate, { messages, stream: true, max_tokens: maxTokens });
            if (!source || typeof source.getReader !== 'function') {
              const text = sseEventText(source) || String(source?.result?.response || '');
              if (text) { fullText = text; send({ type: 'delta', text }); }
            } else {
              await readWorkersAiSse(source, {
                onText: text => { fullText += text; send({ type: 'delta', text }); },
                onFinish: reason => { finishReason = reason; },
              });
            }
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

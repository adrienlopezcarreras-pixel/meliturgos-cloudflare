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

// Contexte utile approximatif (caractères) au-delà duquel un modèle échoue.
// llama-3.3-70b-fp8-fast accepte ≈24k tokens ; on garde de la marge pour la sortie.
export const STREAM_MODELS = Object.freeze([
  { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', maxInputChars: 48_000 },
  { id: '@cf/google/gemma-4-26b-a4b-it', maxInputChars: 360_000 },
]);

export function messagesChars(messages) {
  return (Array.isArray(messages) ? messages : []).reduce((sum, m) => sum + String(m?.content || '').length, 0);
}

export function selectStreamModel(messages, env = {}) {
  const forced = String(env?.MEL_STREAM_MODEL || '').trim();
  if (forced) return forced;
  const size = messagesChars(messages);
  const fit = STREAM_MODELS.find(model => size <= model.maxInputChars);
  return (fit || STREAM_MODELS[STREAM_MODELS.length - 1]).id;
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
export function streamChatResponse({ env, messages, archive = async () => false, model = null } = {}) {
  const selectedModel = model || selectStreamModel(messages, env);
  const maxTokens = streamOutputTokens(env);
  let fullText = '';
  const body = new ReadableStream({
    async start(controller) {
      const send = event => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      send({ type: 'start', model: selectedModel });
      let finishReason = null;
      try {
        const source = await env.AI.run(selectedModel, { messages, stream: true, max_tokens: maxTokens });
        if (!source || typeof source.getReader !== 'function') {
          const text = sseEventText(source) || String(source?.result?.response || '');
          if (!text) throw Object.assign(new Error('STREAM_UNSUPPORTED'), { code: 'STREAM_UNSUPPORTED' });
          fullText = text;
          send({ type: 'delta', text });
        } else {
          await readWorkersAiSse(source, {
            onText: text => { fullText += text; send({ type: 'delta', text }); },
            onFinish: reason => { finishReason = reason; },
          });
        }
        if (!fullText.trim()) throw Object.assign(new Error('EMPTY_MODEL_RESPONSE'), { code: 'EMPTY_MODEL_RESPONSE' });
        const truncated = finishReason === 'length';
        let archived = false;
        try { archived = await archive(fullText, { model: selectedModel, truncated }); } catch {}
        send({ type: 'done', model: selectedModel, chars: fullText.length, archived: archived === true, truncated });
      } catch (error) {
        const code = String(error?.code || error?.message || 'STREAM_FAILED').slice(0, 120);
        if (fullText.trim()) {
          try { await archive(fullText, { model: selectedModel, truncated: true, error: code }); } catch {}
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
      'x-mel-stream-model': selectedModel,
    },
  });
}

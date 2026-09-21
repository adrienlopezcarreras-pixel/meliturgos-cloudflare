import { port, requireValue } from '../core/contracts.js';

export const methods = ["embed", "batch"];

function extractVectors(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.data) && Array.isArray(result.data[0])) return result.data;
  if (Array.isArray(result?.data) && Array.isArray(result.data[0]?.embedding)) return result.data.map(x => x.embedding);
  if (Array.isArray(result?.result?.data) && Array.isArray(result.result.data[0])) return result.result.data;
  if (Array.isArray(result?.embeddings)) return result.embeddings;
  return null;
}

/**
 * Provider-neutral embeddings port. Network/storage side effects belong only to
 * injected adapters.
 */
export const createEmbeddings = adapters => port('search/embeddings',methods,adapters);

/**
 * Workers AI adapter. It is intentionally opt-in: callers must supply an exact
 * model name, so memory retrieval never creates an implicit paid dependency.
 */
export function createWorkersAiSemanticProvider(ai, { model } = {}) {
  const modelName=String(model||'').trim();
  if (!ai || typeof ai.run !== 'function' || !modelName) return null;

  return async function semanticProvider(texts) {
    requireValue(Array.isArray(texts) && texts.length > 0 && texts.length <= 501, 'EMBEDDING_BATCH_INVALID', 400);
    const normalized=texts.map(text => String(text||'').slice(0,12000));
    const result=await ai.run(modelName,{ text: normalized });
    const vectors=extractVectors(result);
    requireValue(Array.isArray(vectors) && vectors.length===normalized.length, 'EMBEDDING_RESULT_INVALID', 502);
    return vectors.map(vector => Array.from(vector || []).map(Number));
  };
}

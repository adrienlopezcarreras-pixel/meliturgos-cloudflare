import { createLearningEngine } from './learning-engine.js';
import { runLearningBenchmark } from './benchmark-suite.js';
import { extractModelText } from '../models/ModelRouter.js';

export const DEFAULT_OPERATOR_BENCHMARK_MODEL = '@cf/zai-org/glm-4.7-flash';

function cleanModelId(value, fallback) {
  const model = String(value || '').trim();
  return model || fallback;
}

function cleanQuality(value, fallback = 0.65) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

export async function runOperatorBenchmark(env = {}, options = {}, deps = {}) {
  const ai = deps.ai || env.AI;
  if (!ai || typeof ai.run !== 'function') {
    const error = new Error('ai_binding_unavailable');
    error.code = 'AI_BINDING_UNAVAILABLE';
    throw error;
  }

  const createEngine = deps.createLearningEngine || createLearningEngine;
  const benchmarkRunner = deps.runLearningBenchmark || runLearningBenchmark;
  const extractText = deps.extractModelText || extractModelText;
  // The operator endpoint never accepts a request-selected model. Keep model
  // choice on the trusted server side so an authenticated UI action cannot
  // accidentally turn into an arbitrary-cost model launcher.
  const modelId = cleanModelId(env.MEL_BENCHMARK_MODEL, DEFAULT_OPERATOR_BENCHMARK_MODEL);
  const sourceSha = String(options.source_sha || env.MEL_SOURCE_SHA || env.CF_PAGES_COMMIT_SHA || 'unknown').trim() || 'unknown';

  const benchmark = await benchmarkRunner({
    modelId,
    sourceSha,
    respond: async (prompt) => {
      const result = await ai.run(modelId, {
        messages: [
          {
            role: 'system',
            content: 'Tu es MEL en mode benchmark. Réponds directement à la consigne, sans commentaire sur le benchmark.',
          },
          { role: 'user', content: String(prompt || '') },
        ],
        temperature: 0,
        max_tokens: 512,
      });
      const text = extractText(result);
      if (typeof text !== 'string' || !text.trim()) throw new Error('empty_benchmark_response');
      return text.trim();
    },
  });

  const engine = createEngine(env);
  const persisted = await engine.recordBenchmark({
    cases: benchmark.cases,
    kind: 'operator',
    model_id: modelId,
    source_sha: sourceSha,
    metadata: {
      benchmark_id: benchmark.benchmark_id,
      version: benchmark.version,
      case_count: benchmark.case_count,
      measured_score: benchmark.score,
      trigger: 'professor',
    },
  });

  return {
    benchmark,
    persisted,
    model_id: modelId,
    source_sha: sourceSha,
  };
}

export async function prepareOperatorLora(env = {}, options = {}, deps = {}) {
  const createEngine = deps.createLearningEngine || createLearningEngine;
  const engine = createEngine(env);
  const baseModel = cleanModelId(options.base_model || env.MEL_LORA_BASE_MODEL, undefined);
  const minQuality = cleanQuality(options.min_quality, 0.65);
  const prepared = await engine.prepareLora({
    ...(baseModel ? { base_model: baseModel } : {}),
    minQuality,
  });

  return {
    ...prepared,
    trainer: {
      available: false,
      status: 'NOT_CONFIGURED',
      reason: 'Aucun exécuteur d’entraînement LoRA externe n’est configuré dans ce Worker.',
    },
  };
}

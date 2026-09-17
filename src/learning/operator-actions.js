import { createLearningEngine } from './learning-engine.js';
import { MEL_LEARNING_BENCHMARK_CASES, runLearningBenchmark, scoreBenchmarkResponse } from './benchmark-suite.js';
import { extractModelText } from '../models/ModelRouter.js';
import { standardRegistry } from '../models/ModelRegistry.js';
import { CANONICAL_LEARNING_BENCHMARK_SUITE, benchmarkSuiteFingerprint } from '../evaluation/benchmarks.js';

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

function benchmarkModel(env = {}) {
  const modelId = cleanModelId(env.MEL_BENCHMARK_MODEL, DEFAULT_OPERATOR_BENCHMARK_MODEL);
  const model = standardRegistry.get(modelId);
  if (!model || model.enabled === false || model.cost === null || model.cost === undefined || Number(model.cost) !== 0) {
    const error = new Error('benchmark_model_not_verified_zero_cost');
    error.code = 'BENCHMARK_MODEL_NOT_VERIFIED_ZERO_COST';
    error.model_id = modelId;
    throw error;
  }
  return modelId;
}

function benchmarkSourceSha(env = {}, options = {}) {
  const compiled = typeof MEL_DEPLOYED_GIT_SHA !== 'undefined' ? String(MEL_DEPLOYED_GIT_SHA || '') : '';
  return String(
    options.source_sha
      || compiled
      || env.MEL_DEPLOYED_GIT_SHA
      || env.MEL_SOURCE_SHA
      || env.CF_PAGES_COMMIT_SHA
      || 'unknown'
  ).trim() || 'unknown';
}

function benchmarkResponder(ai, modelId, extractText) {
  return async (prompt) => {
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
  };
}

export function createZeroCostBenchmarkEvaluator(env = {}, deps = {}) {
  const ai = deps.ai || env.AI;
  if (!ai || typeof ai.run !== 'function') {
    const error = new Error('ai_binding_unavailable');
    error.code = 'AI_BINDING_UNAVAILABLE';
    throw error;
  }

  const modelId = benchmarkModel(env);
  const extractText = deps.extractModelText || extractModelText;
  const respond = benchmarkResponder(ai, modelId, extractText);
  const casesById = new Map(MEL_LEARNING_BENCHMARK_CASES.map((row) => [String(row.id), row]));

  return {
    model_id: modelId,
    evaluator: async (testCase = {}) => {
      const fixture = casesById.get(String(testCase.id || ''));
      if (!fixture) {
        const error = new Error('benchmark_case_fixture_missing');
        error.code = 'BENCHMARK_CASE_FIXTURE_MISSING';
        error.case_id = String(testCase.id || '');
        throw error;
      }
      const response = await respond(fixture.prompt);
      const scored = scoreBenchmarkResponse(response, fixture.rubric);
      return {
        score: scored.score,
        repeated_error: String(testCase.domain || '') === 'taught_error_correction' && scored.score < 1,
        evidence: {
          model_id: modelId,
          case_id: fixture.id,
          checks: scored.checks,
        },
      };
    },
  };
}

export async function ensureZeroCostBenchmarkBaseline(env = {}, options = {}, deps = {}) {
  const createEngine = deps.createLearningEngine || createLearningEngine;
  const engine = createEngine(env);
  const suiteDigest = benchmarkSuiteFingerprint(CANONICAL_LEARNING_BENCHMARK_SUITE);
  const existing = typeof engine.benchmarks === 'function'
    ? await engine.benchmarks({ limit: 200 })
    : [];
  const baseline = (Array.isArray(existing) ? existing : []).find(
    (row) => row?.kind === 'baseline' && row?.metadata?.suite_digest === suiteDigest,
  );

  if (baseline) {
    return {
      status: 'EXISTS',
      created: false,
      score: Number.isFinite(Number(baseline.overall)) ? Number(baseline.overall) : null,
      cases: Number.isFinite(Number(baseline.cases)) ? Number(baseline.cases) : null,
      suite_digest: suiteDigest,
      model_id: baseline.model_id || null,
      source_sha: baseline.source_sha || null,
    };
  }

  const prepared = createZeroCostBenchmarkEvaluator(env, deps);
  const sourceSha = benchmarkSourceSha(env, options);
  const run = await engine.runCanonicalBenchmark({
    kind: 'baseline',
    evaluator: prepared.evaluator,
    model_id: prepared.model_id,
    source_sha: sourceSha,
    metadata: {
      trigger: String(options.trigger || 'scheduled-bootstrap'),
    },
  });

  return {
    status: run?.reused === true ? 'REUSED' : 'RAN',
    created: run?.reused !== true,
    score: Number.isFinite(Number(run?.score?.overall)) ? Number(run.score.overall) : null,
    cases: Number.isFinite(Number(run?.score?.cases)) ? Number(run.score.cases) : null,
    suite_digest: run?.suite_digest || suiteDigest,
    model_id: prepared.model_id,
    source_sha: sourceSha,
  };
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
  // The operator endpoint never accepts a request-selected model. Model choice
  // stays on the trusted server side and must be explicitly zero-cost in the
  // canonical registry before any Workers AI call is allowed.
  const modelId = benchmarkModel(env);
  const sourceSha = benchmarkSourceSha(env, options);

  const respond = benchmarkResponder(ai, modelId, extractText);
  const benchmark = await benchmarkRunner({
    modelId,
    sourceSha,
    metadata: {
      model_id: modelId,
      source_sha: sourceSha,
      trigger: 'professor',
    },
    respond,
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

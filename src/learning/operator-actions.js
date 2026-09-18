import { createLearningEngine } from './learning-engine.js';
import { MEL_LEARNING_BENCHMARK_CASES, runLearningBenchmark, scoreBenchmarkResponse } from './benchmark-suite.js';
import { extractModelText } from '../models/ModelRouter.js';
import { standardRegistry } from '../models/ModelRegistry.js';
import { CANONICAL_LEARNING_BENCHMARK_SUITE, benchmarkSuiteFingerprint } from '../evaluation/benchmarks.js';
import { assertAdapterApprovalForArtifact, assertAdapterArtifactForPlan } from './lora-plan.js';
import { compareLoraImpact, runLoraImpactBenchmark } from './lora-impact-benchmark.js';

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

function benchmarkResponder(ai, modelId, extractText, { lora = null } = {}) {
  return async (prompt) => {
    const input = {
      messages: [
        {
          role: 'system',
          content: 'Tu es MEL en mode benchmark. Réponds directement à la consigne, sans commentaire sur le benchmark.',
        },
        { role: 'user', content: String(prompt || '') },
      ],
      temperature: 0,
      max_tokens: 512,
    };
    if (lora) input.lora = String(lora);
    const result = await ai.run(modelId, input);
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

export async function runOperatorLoraBenchmark(env = {}, options = {}, deps = {}) {
  const ai = deps.ai || env.AI;
  if (!ai || typeof ai.run !== 'function') {
    const error = new Error('ai_binding_unavailable');
    error.code = 'AI_BINDING_UNAVAILABLE';
    throw error;
  }

  const plan = options.plan;
  const checkedArtifact = assertAdapterArtifactForPlan({ plan, artifact: options.artifact });
  const checkedApproval = assertAdapterApprovalForArtifact({ plan, artifact: checkedArtifact, approval: options.approval });
  const createEngine = deps.createLearningEngine || createLearningEngine;
  const benchmarkRunner = deps.runLearningBenchmark || runLearningBenchmark;
  const impactRunner = deps.runLoraImpactBenchmark || runLoraImpactBenchmark;
  const extractText = deps.extractModelText || extractModelText;
  const sourceSha = benchmarkSourceSha(env, options);
  const suiteDigest = benchmarkSuiteFingerprint(CANONICAL_LEARNING_BENCHMARK_SUITE);
  const runtimeModel = checkedArtifact.runtime_model;

  const baseline = await benchmarkRunner({
    metadata: {
      model_id: runtimeModel,
      source_sha: sourceSha,
      trigger: 'lora-gate-baseline',
      suite_digest: suiteDigest,
    },
    respond: benchmarkResponder(ai, runtimeModel, extractText),
  });
  baseline.passed = Array.isArray(baseline.cases) && baseline.cases.length > 0 && baseline.cases.every((row) => !row?.error);

  const candidate = await benchmarkRunner({
    metadata: {
      model_id: runtimeModel,
      adapter_id: checkedArtifact.finetune_id,
      source_sha: sourceSha,
      trigger: 'lora-gate-candidate',
      suite_digest: suiteDigest,
    },
    provenance: {
      artifact_digest: checkedArtifact.digest,
      training_manifest_digest: checkedArtifact.training_manifest_digest,
      dataset_digest: checkedArtifact.dataset_digest,
      approval_id: checkedApproval.approval_id,
    },
    respond: benchmarkResponder(ai, runtimeModel, extractText, { lora: checkedArtifact.finetune_id }),
  });
  candidate.passed = Array.isArray(candidate.cases) && candidate.cases.length > 0 && candidate.cases.every((row) => !row?.error);

  const impactBaseline = await impactRunner({
    respond: benchmarkResponder(ai, runtimeModel, extractText),
  });
  const impactCandidate = await impactRunner({
    respond: benchmarkResponder(ai, runtimeModel, extractText, { lora: checkedArtifact.finetune_id }),
  });
  const impact = compareLoraImpact(impactBaseline, impactCandidate);

  const engine = createEngine(env);
  await engine.recordBenchmark({
    cases: baseline.cases,
    kind: 'lora-baseline',
    model_id: runtimeModel,
    source_sha: sourceSha,
    metadata: {
      suite_digest: suiteDigest,
      benchmark_id: baseline.benchmark_id,
      measured_score: baseline.overall,
      passed: baseline.passed,
    },
  });
  await engine.recordBenchmark({
    cases: candidate.cases,
    kind: 'lora-candidate',
    model_id: runtimeModel,
    adapter_id: checkedArtifact.finetune_id,
    source_sha: sourceSha,
    metadata: {
      suite_digest: suiteDigest,
      benchmark_id: candidate.benchmark_id,
      measured_score: candidate.overall,
      passed: candidate.passed,
      artifact_digest: checkedArtifact.digest,
      training_manifest_digest: checkedArtifact.training_manifest_digest,
      dataset_digest: checkedArtifact.dataset_digest,
      approval_id: checkedApproval.approval_id,
    },
  });
  await engine.recordBenchmark({
    cases: impactBaseline.cases,
    kind: 'lora-impact-baseline',
    model_id: runtimeModel,
    source_sha: sourceSha,
    metadata: {
      suite: impactBaseline.suite,
      version: impactBaseline.version,
      impact_metrics: impactBaseline.metrics,
      case_count: impactBaseline.case_count,
    },
  });
  await engine.recordBenchmark({
    cases: impactCandidate.cases,
    kind: 'lora-impact-candidate',
    model_id: runtimeModel,
    adapter_id: checkedArtifact.finetune_id,
    source_sha: sourceSha,
    metadata: {
      suite: impactCandidate.suite,
      version: impactCandidate.version,
      impact_metrics: impactCandidate.metrics,
      impact_delta: impact.delta,
      uncensored_gate: impact.uncensored_gate,
      next_stage: impact.next_stage,
      artifact_digest: checkedArtifact.digest,
      training_manifest_digest: checkedArtifact.training_manifest_digest,
      dataset_digest: checkedArtifact.dataset_digest,
      approval_id: checkedApproval.approval_id,
    },
  });

  const decision = await engine.evaluateAdapter({
    plan,
    artifact: checkedArtifact,
    approval: checkedApproval,
    baseline,
    candidate,
  });
  const impactGatePassed = impact.uncensored_gate === true;
  const stageReady = decision.promote === true && impactGatePassed;
  const nextStage = stageReady ? 'AGENTIC_READY' : 'UNCENSORED_CONTINUE';

  let active = null;
  if (options.activate === true && stageReady) {
    active = await engine.activateAdapter({
      plan,
      artifact: checkedArtifact,
      approval: checkedApproval,
      baseline,
      candidate,
    });
  }

  return {
    plan_id: plan?.id || null,
    artifact: checkedArtifact,
    approval: checkedApproval,
    baseline,
    candidate,
    decision,
    impact: {
      baseline: impactBaseline,
      candidate: impactCandidate,
      comparison: impact,
    },
    next_stage: nextStage,
    impact_gate_passed: impactGatePassed,
    canonical_gate_passed: decision.promote === true,
    activation_blocker: stageReady ? null : (decision.promote === true ? 'LORA_IMPACT_GATE_NOT_PASSED' : String(decision.reason || 'CANONICAL_BENCHMARK_NOT_PASSED')),
    active,
    activated: Boolean(active),
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

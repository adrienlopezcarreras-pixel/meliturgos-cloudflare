import { MentorMemoryRepository } from './mentor-memory.js';
import { buildTrainingCorpus, createCorrectionRecord, decideAdapterPromotion, summarizeLearning } from './correction-corpus.js';
import { CANONICAL_LEARNING_BENCHMARK_SUITE, compareBenchmarkScores, runLearningBenchmarkSuite, scoreBenchmarkResults } from '../evaluation/benchmarks.js';
import { chooseBestSettings, proposeNeighborSettings, sanitizeInferenceSettings } from './inference-adaptation.js';
import { assertAdapterActivationEvidence, assertAdapterArtifact, createLoraTrainingPlan } from './lora-plan.js';
import { BOOTSTRAP_CORRECTIONS } from './bootstrap-corrections.js';

function evidenceObject(row) {
  const value = row?.evidence;
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function digest(value) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function dedupeCorrections(rows = []) {
  const byId = new Map();
  for (const row of rows) {
    if (!row?.id || byId.has(row.id)) continue;
    byId.set(row.id, row);
  }
  return [...byId.values()];
}

export class LearningEngine {
  constructor({ memory } = {}) {
    this.memory = memory || new MentorMemoryRepository(null);
  }

  async recordCorrection(input = {}) {
    const row = createCorrectionRecord(input);
    await this.memory.remember({
      id: `correction:${row.id}`,
      job_id: input.job_id || null,
      goal: row.task || row.input,
      kind: 'TEACHER_CORRECTION',
      lesson: row.rationale,
      evidence: row,
      outcome: row.validated ? 'SUCCEEDED' : 'PENDING',
      score: row.quality,
      tags: ['learning', 'correction', row.domain, ...row.tags].slice(0, 20),
      created_at: row.created_at,
    });
    return row;
  }

  async corrections({ limit = null, includeBootstrap = true } = {}) {
    const numericLimit = Number(limit);
    const requested = Number.isFinite(numericLimit) && numericLimit > 0
      ? Math.max(1, Math.trunc(numericLimit))
      : null;
    const useFullCorpus = requested === null || requested > 500;
    const rows = useFullCorpus && typeof this.memory.all === 'function'
      ? await this.memory.all({ kind: 'TEACHER_CORRECTION' })
      : await this.memory.recent({ limit: requested || 500, kind: 'TEACHER_CORRECTION' });
    const persisted = rows.map(evidenceObject).filter(row => row?.input && row?.before && row?.after && row?.rationale);
    const merged = dedupeCorrections(includeBootstrap ? [...persisted, ...BOOTSTRAP_CORRECTIONS] : persisted);
    return requested === null ? merged : merged.slice(0, requested);
  }

  async trainingBundle({ minQuality = 0.65, limit = null } = {}) {
    const corrections = await this.corrections({ limit });
    const corpus = buildTrainingCorpus(corrections, { validatedOnly: true, minQuality });
    const dataset = { sft: corpus.sft, preference: corpus.preference };
    return { ...corpus, digest: digest(dataset), dataset, generated_at: Date.now() };
  }

  async recordBenchmark({ cases, kind = 'candidate', model_id = '', adapter_id = null, source_sha = null, metadata = {} } = {}) {
    const score = scoreBenchmarkResults(cases || []);
    const evidence = { kind, model_id, adapter_id, source_sha, ...score, metadata };
    const record = await this.memory.remember({
      goal: `MEL benchmark ${kind}`,
      kind: 'LEARNING_BENCHMARK',
      lesson: `Benchmark ${kind}: ${(score.overall * 100).toFixed(2)}% sur ${score.cases} cas.`,
      evidence,
      outcome: 'SUCCEEDED',
      score: score.overall,
      tags: ['learning', 'benchmark', kind, model_id, adapter_id].filter(Boolean),
    });
    return { record, score };
  }

  async benchmarks({ limit = 200 } = {}) {
    const rows = await this.memory.recent({ limit: Math.min(500, Math.max(1, Number(limit) || 200)), kind: 'LEARNING_BENCHMARK' });
    return rows.slice().reverse().map(evidenceObject).filter(row => Number.isFinite(Number(row?.overall)));
  }

  async runCanonicalBenchmark({ kind = 'candidate', evaluator, model_id = '', adapter_id = null, source_sha = null, metadata = {}, suite = CANONICAL_LEARNING_BENCHMARK_SUITE } = {}) {
    const result = await runLearningBenchmarkSuite({ suite, evaluator });
    if (kind === 'baseline') {
      const existing = (await this.benchmarks({ limit: 200 })).find((row) => row.kind === 'baseline' && row?.metadata?.suite_digest === result.suite_digest);
      if (existing) {
        return { reused: true, record: null, score: existing, results: [], suite_id: result.suite_id, suite_digest: result.suite_digest };
      }
    }
    const repeatedErrors = result.repeated_errors.length;
    const recorded = await this.recordBenchmark({
      cases: result.results,
      kind,
      model_id,
      adapter_id,
      source_sha,
      metadata: {
        ...metadata,
        suite_id: result.suite_id,
        suite_digest: result.suite_digest,
        required_domains: result.required_domains,
        repeated_errors: result.repeated_errors,
        repeated_error_count: repeatedErrors,
      },
    });
    return { ...recorded, reused: false, results: result.results, suite_id: result.suite_id, suite_digest: result.suite_digest, repeated_errors: result.repeated_errors };
  }

  async advanceBenchmarkCadence({
    verifiedJobsDelta = 0,
    significantCorrections = 0,
    evaluator = null,
    model_id = '',
    adapter_id = null,
    source_sha = null,
    metadata = {},
    everyVerifiedJobs = 5,
  } = {}) {
    const interval = Math.max(1, Math.min(100, Math.trunc(Number(everyVerifiedJobs) || 5)));
    const previousRows = await this.memory.recent({ limit: 1, kind: 'BENCHMARK_CADENCE' });
    const previous = evidenceObject(previousRows[0]);
    const previousCount = Math.max(0, Math.trunc(Number(previous?.verified_jobs_since_benchmark) || 0));
    const verifiedDelta = Math.max(0, Math.trunc(Number(verifiedJobsDelta) || 0));
    const corrections = Math.max(0, Math.trunc(Number(significantCorrections) || 0));
    const accumulated = previousCount + verifiedDelta;
    const dueReason = corrections > 0
      ? 'SIGNIFICANT_CORRECTION_BATCH'
      : (accumulated >= interval ? 'VERIFIED_JOB_CADENCE' : null);

    let status = dueReason ? 'DUE' : 'NOT_DUE';
    let verifiedJobsSinceBenchmark = accumulated;
    let benchmark = null;
    let comparison = previous?.comparison || null;
    let repeatedTaughtErrors = Math.max(0, Math.trunc(Number(previous?.repeated_taught_errors) || 0));
    let failure = null;

    if (dueReason && typeof evaluator !== 'function') {
      status = 'SKIPPED_EVALUATOR_UNAVAILABLE';
    } else if (dueReason) {
      try {
        const run = await this.runCanonicalBenchmark({
          kind: 'candidate',
          evaluator,
          model_id,
          adapter_id,
          source_sha,
          metadata: { ...metadata, cadence_reason: dueReason },
        });
        benchmark = {
          kind: 'candidate',
          overall: Number(run?.score?.overall || 0),
          cases: Number(run?.score?.cases || run?.results?.length || 0),
          suite_id: run?.suite_id || null,
          suite_digest: run?.suite_digest || null,
          repeated_error_count: Array.isArray(run?.repeated_errors) ? run.repeated_errors.length : 0,
          source_sha: source_sha || null,
        };
        status = 'RAN';
        verifiedJobsSinceBenchmark = 0;
      } catch (error) {
        status = 'FAILED';
        failure = String(error?.code || error?.message || 'BENCHMARK_FAILED').slice(0, 200);
      }
    }

    if (dueReason) {
      try {
        const report = await this.report();
        comparison = report?.benchmark_comparison || null;
        repeatedTaughtErrors = Math.max(0, Math.trunc(Number(report?.repeated_taught_errors) || 0));
      } catch (error) {
        if (!failure) failure = String(error?.code || error?.message || 'BENCHMARK_REPORT_FAILED').slice(0, 200);
      }
    }

    const evidence = {
      status,
      due_reason: dueReason,
      evaluator_available: typeof evaluator === 'function',
      verified_jobs_since_benchmark: verifiedJobsSinceBenchmark,
      every_verified_jobs: interval,
      significant_corrections: corrections,
      source_sha: source_sha || null,
      benchmark,
      comparison,
      repeated_taught_errors: repeatedTaughtErrors,
      failure,
      metadata,
      measured_at: Date.now(),
    };

    await this.memory.remember({
      goal: 'MEL automatic benchmark cadence',
      kind: 'BENCHMARK_CADENCE',
      lesson: status === 'RAN'
        ? 'Benchmark canonique exécuté et état de comparaison persisté.'
        : (status === 'SKIPPED_EVALUATOR_UNAVAILABLE'
          ? 'Benchmark dû mais différé: aucun évaluateur zéro-coût explicite n’est disponible.'
          : (status === 'FAILED' ? 'Benchmark dû mais échoué; cadence conservée pour nouvel essai.' : 'Cadence benchmark mise à jour.')),
      evidence,
      outcome: status === 'RAN' ? 'SUCCEEDED' : (status === 'FAILED' ? 'FAILED' : (status === 'SKIPPED_EVALUATOR_UNAVAILABLE' ? 'BLOCKED_EXTERNAL' : 'PENDING')),
      score: Number(benchmark?.overall || 0),
      tags: ['learning', 'benchmark', 'cadence', status.toLowerCase()],
    });
    return evidence;
  }

  async recordInferenceTrial({ settings, score, failed = false, case_id = '', source_sha = null, metadata = {} } = {}) {
    const normalized = sanitizeInferenceSettings(settings || {});
    const numericScore = Number(score);
    if (!Number.isFinite(numericScore)) {
      throw Object.assign(new Error('INFERENCE_TRIAL_SCORE_REQUIRED'), { code: 'INFERENCE_TRIAL_SCORE_REQUIRED' });
    }
    const evidence = {
      settings: normalized,
      score: Math.max(0, Math.min(1, numericScore)),
      failed: failed === true,
      case_id: String(case_id || '').slice(0, 200),
      source_sha: source_sha || null,
      metadata,
      measured_at: Date.now(),
    };
    await this.memory.remember({
      goal: 'MEL measured inference trial',
      kind: 'INFERENCE_TRIAL',
      lesson: failed ? 'Réglage mesuré avec échec.' : 'Réglage mesuré avec score exploitable.',
      evidence,
      outcome: failed ? 'FAILED' : 'SUCCEEDED',
      score: evidence.score,
      tags: ['learning', 'inference-trial'],
    });
    return evidence;
  }

  async inferenceTrials({ limit = 200 } = {}) {
    const rows = await this.memory.recent({ limit: Math.min(500, Math.max(1, Number(limit) || 200)), kind: 'INFERENCE_TRIAL' });
    return rows.slice().reverse().map(evidenceObject).filter((row) => Number.isFinite(Number(row?.score)) && row?.settings);
  }

  async promoteMeasuredInferenceSettings({ current = null, minimumTrials = 3, minimumGain = 0.02, evidence = {} } = {}) {
    const active = current ? sanitizeInferenceSettings(current) : await this.activeInferenceSettings();
    const trials = await this.inferenceTrials({ limit: 500 });
    const decision = chooseBestSettings(trials, { current: active, minimumTrials, minimumGain });
    if (!decision.promote) return { promoted: false, decision, settings: active };
    const promoted = await this.saveInferenceSettings(decision.candidate, {
      ...evidence,
      score: decision.candidate_score,
      active_score: decision.active_score,
      minimum_trials: minimumTrials,
      minimum_gain: minimumGain,
      trial_count: trials.length,
      reason: decision.reason,
    });
    return { promoted: true, decision, settings: promoted };
  }

  async report() {
    const [corrections, benchmarks, activeAdapters, trials] = await Promise.all([
      this.corrections({ limit: null }),
      this.benchmarks({ limit: 200 }),
      this.memory.recent({ limit: 20, kind: 'LORA_ADAPTER_ACTIVE' }),
      this.inferenceTrials({ limit: 500 }),
    ]);
    const runs = benchmarks.map(row => ({ kind: row.kind, score: Number(row.overall) }));
    const summary = summarizeLearning(corrections, runs);
    const baseline = benchmarks.find(row => row.kind === 'baseline') || null;
    const latest = benchmarks.length ? benchmarks[benchmarks.length - 1] : null;
    const comparison = baseline && latest ? compareBenchmarkScores(baseline, latest) : null;
    const repeatedErrors = benchmarks.reduce((total, row) => total + Number(row?.metadata?.repeated_error_count || 0), 0);
    return {
      ...summary,
      benchmark_comparison: comparison,
      corrections_available_for_training: buildTrainingCorpus(corrections).accepted,
      inference_trials: trials.length,
      repeated_taught_errors: repeatedErrors,
      neural_weights_changed: activeAdapters.length > 0,
      active_adapter_count: activeAdapters.length,
      active_adapter: activeAdapters.length ? evidenceObject(activeAdapters[0]) : null,
    };
  }

  async suggestInferenceSettings({ trials = [], current = {}, signal = {} } = {}) {
    const active = sanitizeInferenceSettings(current);
    const measured = chooseBestSettings(trials, { current: active });
    return { active, measured, next_experiment: measured.promote ? measured.candidate : proposeNeighborSettings(active, signal) };
  }

  async saveInferenceSettings(settings, evidence = {}) {
    const normalized = sanitizeInferenceSettings(settings);
    await this.memory.remember({
      goal: 'MEL active inference settings',
      kind: 'INFERENCE_SETTINGS',
      lesson: 'Réglages d’inférence promus après mesure.',
      evidence: { settings: normalized, evidence, promoted_at: Date.now() },
      outcome: 'SUCCEEDED',
      score: Number(evidence.score || 0),
      tags: ['learning', 'inference-settings'],
    });
    return normalized;
  }

  async activeInferenceSettings() {
    const rows = await this.memory.recent({ limit: 1, kind: 'INFERENCE_SETTINGS' });
    return sanitizeInferenceSettings(evidenceObject(rows[0])?.settings || {});
  }

  async prepareLora({ base_model, minQuality = 0.65, ...options } = {}) {
    const bundle = await this.trainingBundle({ minQuality, limit: null });
    const plan = createLoraTrainingPlan({ ...options, base_model, dataset_digest: bundle.digest, examples: bundle.accepted });
    const ready = plan.readiness.enough_examples === true && plan.readiness.cloudflare_inference_compatible === true;
    const blockedOutcome = plan.readiness.enough_examples ? 'BLOCKED_EXTERNAL' : 'BLOCKED_DATA';
    const lesson = ready
      ? 'Corpus suffisant et configuration compatible pour lancer un entraînement candidat.'
      : (!plan.readiness.enough_examples
        ? `Corpus insuffisant: ${plan.examples}/${plan.readiness.min_examples}.`
        : 'Configuration LoRA incompatible avec le runtime Cloudflare; entraînement/promotion bloqués jusqu’à correction compatible.');
    await this.memory.remember({
      goal: `Prepare MEL LoRA ${plan.id}`,
      kind: 'LORA_PLAN',
      lesson,
      evidence: plan,
      outcome: ready ? 'READY' : blockedOutcome,
      score: Math.min(1, plan.examples / plan.readiness.min_examples),
      tags: ['learning', 'lora', plan.status],
    });
    return { plan, corpus: { accepted: bundle.accepted, rejected: bundle.rejected, digest: bundle.digest } };
  }

  async evaluateAdapter({ plan, artifact, approval, baseline, candidate } = {}) {
    const checkedArtifact = assertAdapterArtifact(artifact);
    let exactEvidence = null;
    let decision;
    try {
      exactEvidence = assertAdapterActivationEvidence({ plan, artifact: checkedArtifact, approval, baseline, candidate });
      decision = decideAdapterPromotion({ baseline, candidate, minOverallGain: exactEvidence.minimum_gain });
    } catch (error) {
      decision = { promote: false, reason: String(error?.code || error?.message || 'LORA_EVIDENCE_INVALID') };
    }
    await this.memory.remember({
      goal: `Evaluate MEL adapter ${plan?.id || checkedArtifact.id}`,
      kind: 'LORA_ADAPTER_EVAL',
      lesson: decision.promote ? 'Adaptateur candidat accepté par le benchmark et les preuves exactes.' : `Adaptateur rejeté: ${decision.reason}.`,
      evidence: { plan, artifact: checkedArtifact, approval, baseline, candidate, exact_evidence: exactEvidence, decision },
      outcome: decision.promote ? 'APPROVED' : 'REJECTED',
      score: Number(candidate?.overall || 0),
      tags: ['learning', 'lora', 'evaluation'],
    });
    return { ...decision, exact_evidence: exactEvidence };
  }

  async activateAdapter({ plan, artifact, approval, baseline, candidate } = {}) {
    const exactEvidence = assertAdapterActivationEvidence({ plan, artifact, approval, baseline, candidate });
    const checkedArtifact = exactEvidence.artifact;
    const decision = decideAdapterPromotion({ baseline, candidate, minOverallGain: exactEvidence.minimum_gain });
    if (!decision.promote) {
      throw Object.assign(new Error(`LORA_ACTIVATION_DENIED:${decision.reason}`), { code: 'LORA_ACTIVATION_DENIED', decision });
    }
    const active = {
      plan_id: plan.id,
      adapter: checkedArtifact,
      finetune_id: checkedArtifact.finetune_id,
      base_model: checkedArtifact.base_model,
      runtime_model: checkedArtifact.runtime_model,
      dataset_digest: plan.dataset_digest,
      training_manifest_digest: plan.training_manifest_digest,
      approval: exactEvidence.approval,
      benchmark: { baseline, candidate, decision, exact_evidence: exactEvidence },
      activated_at: Date.now(),
    };
    await this.memory.remember({
      goal: `Activate MEL adapter ${checkedArtifact.id}`,
      kind: 'LORA_ADAPTER_ACTIVE',
      lesson: 'Adaptateur LoRA réellement activé après benchmark supérieur et absence de régression majeure.',
      evidence: active,
      outcome: 'SUCCEEDED',
      score: Number(candidate?.overall || 0),
      tags: ['learning', 'lora', 'active'],
    });
    return active;
  }

  async activeAdapter() {
    const rows = await this.memory.recent({ limit: 1, kind: 'LORA_ADAPTER_ACTIVE' });
    return rows.length ? evidenceObject(rows[0]) : null;
  }
}

export function createLearningEngine(env, options = {}) {
  return new LearningEngine({ memory: options.memory || new MentorMemoryRepository(env?.DB) });
}

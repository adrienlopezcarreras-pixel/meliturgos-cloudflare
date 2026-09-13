import { MentorMemoryRepository } from './mentor-memory.js';
import { buildTrainingCorpus, createCorrectionRecord, decideAdapterPromotion, summarizeLearning } from './correction-corpus.js';
import { scoreBenchmarkResults, compareBenchmarkScores } from '../evaluation/benchmarks.js';
import { chooseBestSettings, proposeNeighborSettings, sanitizeInferenceSettings } from './inference-adaptation.js';
import { assertAdapterArtifact, createLoraTrainingPlan } from './lora-plan.js';

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

  async corrections({ limit = 50 } = {}) {
    const rows = await this.memory.recent({ limit: Math.min(50, Math.max(1, Number(limit) || 50)), kind: 'TEACHER_CORRECTION' });
    return rows.map(evidenceObject).filter(row => row?.input && row?.before && row?.after && row?.rationale);
  }

  async trainingBundle({ minQuality = 0.65 } = {}) {
    const corrections = await this.corrections({ limit: 50 });
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

  async benchmarks({ limit = 50 } = {}) {
    const rows = await this.memory.recent({ limit: Math.min(50, Math.max(1, Number(limit) || 50)), kind: 'LEARNING_BENCHMARK' });
    return rows.slice().reverse().map(evidenceObject).filter(row => Number.isFinite(Number(row?.overall)));
  }

  async report() {
    const [corrections, benchmarks, activeAdapters] = await Promise.all([
      this.corrections({ limit: 50 }),
      this.benchmarks({ limit: 50 }),
      this.memory.recent({ limit: 20, kind: 'LORA_ADAPTER_ACTIVE' }),
    ]);
    const runs = benchmarks.map(row => ({ kind: row.kind, score: Number(row.overall) }));
    const summary = summarizeLearning(corrections, runs);
    const baseline = benchmarks.find(row => row.kind === 'baseline') || null;
    const latest = benchmarks.length ? benchmarks[benchmarks.length - 1] : null;
    const comparison = baseline && latest ? compareBenchmarkScores(baseline, latest) : null;
    return {
      ...summary,
      benchmark_comparison: comparison,
      corrections_available_for_training: buildTrainingCorpus(corrections).accepted,
      neural_weights_changed: activeAdapters.length > 0,
      active_adapter_count: activeAdapters.length,
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
    const bundle = await this.trainingBundle({ minQuality });
    const plan = createLoraTrainingPlan({ ...options, base_model, dataset_digest: bundle.digest, examples: bundle.accepted });
    await this.memory.remember({
      goal: `Prepare MEL LoRA ${plan.id}`,
      kind: 'LORA_PLAN',
      lesson: plan.readiness.enough_examples ? 'Corpus suffisant pour lancer un entraînement candidat.' : `Corpus insuffisant: ${plan.examples}/${plan.readiness.min_examples}.`,
      evidence: plan,
      outcome: plan.readiness.enough_examples ? 'READY' : 'BLOCKED_DATA',
      score: Math.min(1, plan.examples / plan.readiness.min_examples),
      tags: ['learning', 'lora', plan.status],
    });
    return { plan, corpus: { accepted: bundle.accepted, rejected: bundle.rejected, digest: bundle.digest } };
  }

  async evaluateAdapter({ plan, artifact, baseline, candidate } = {}) {
    const checkedArtifact = assertAdapterArtifact(artifact);
    const decision = decideAdapterPromotion({ baseline, candidate });
    await this.memory.remember({
      goal: `Evaluate MEL adapter ${plan?.id || checkedArtifact.id}`,
      kind: 'LORA_ADAPTER_EVAL',
      lesson: decision.promote ? 'Adaptateur candidat accepté par le benchmark.' : `Adaptateur rejeté: ${decision.reason}.`,
      evidence: { plan, artifact: checkedArtifact, baseline, candidate, decision },
      outcome: decision.promote ? 'APPROVED' : 'REJECTED',
      score: Number(candidate?.overall || 0),
      tags: ['learning', 'lora', 'evaluation'],
    });
    return decision;
  }
}

export function createLearningEngine(env, options = {}) {
  return new LearningEngine({ memory: options.memory || new MentorMemoryRepository(env?.DB) });
}

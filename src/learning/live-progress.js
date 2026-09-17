import { buildLearningProgress } from './progress.js';

const PROJECT_EXPERIENCE_SOURCE = 'project_experience_consolidation_v1';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finiteNonNegativeInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback;
}

function nullableNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function rankForLevel(level) {
  if (level >= 30) return 'Évolution';
  if (level >= 20) return 'Maîtrise';
  if (level >= 12) return 'Consolidation';
  if (level >= 6) return 'Apprentissage';
  return 'Éveil';
}

function readEvidence(row) {
  if (!row || typeof row !== 'object') return null;
  if (row.evidence && typeof row.evidence === 'object') return row.evidence;
  if (!row.evidence_json) return null;
  try {
    const parsed = typeof row.evidence_json === 'string' ? JSON.parse(row.evidence_json) : row.evidence_json;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function isoFromEpoch(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  try { return new Date(n).toISOString(); } catch { return null; }
}

export function applyCanonicalXp(progress = {}, canonicalXp = 0) {
  const xp = finiteNonNegativeInt(canonicalXp, finiteNonNegativeInt(progress.xp, 0));
  const level = Math.min(99, Math.floor(Math.sqrt(xp / 250)) + 1);
  const levelStartXp = 250 * Math.pow(level - 1, 2);
  const nextLevelXp = level >= 99 ? levelStartXp : 250 * Math.pow(level, 2);
  const levelSpan = Math.max(1, nextLevelXp - levelStartXp);
  const levelProgress = level >= 99 ? 1 : clamp((xp - levelStartXp) / levelSpan, 0, 1);

  return {
    ...progress,
    xp,
    level,
    rank: rankForLevel(level),
    level_start_xp: levelStartXp,
    next_level_xp: nextLevelXp,
    xp_into_level: Math.max(0, xp - levelStartXp),
    xp_to_next_level: level >= 99 ? 0 : Math.max(0, nextLevelXp - xp),
    level_progress: levelProgress,
    level_progress_percent: Math.round(levelProgress * 1000) / 10,
  };
}

async function latestVerifiedCheckpoint(memory) {
  if (!memory || typeof memory.recent !== 'function') return null;
  try {
    const rows = await memory.recent({ limit: 1, kind: 'LEARNING_XP_CHECKPOINT' });
    const row = Array.isArray(rows) ? rows[0] : null;
    const evidence = readEvidence(row);
    const xp = Number(evidence?.xp_after);
    if (!Number.isFinite(xp) || xp < 0) return null;
    return {
      xp: Math.trunc(xp),
      recorded_at: evidence?.recorded_at || row?.created_at || null,
      source_sha: evidence?.source_sha || null,
      awarded: evidence?.awarded === true,
    };
  } catch {
    return null;
  }
}

async function projectExperienceStatus(db) {
  const base = {
    count: 0,
    source: PROJECT_EXPERIENCE_SOURCE,
    kind: 'lesson',
    available: false,
  };
  if (!db || typeof db.prepare !== 'function') return base;
  try {
    const row = await db.prepare(
      'SELECT COUNT(*) AS count FROM memories WHERE source = ?'
    ).bind(PROJECT_EXPERIENCE_SOURCE).first();
    return {
      ...base,
      count: finiteNonNegativeInt(row?.count, 0),
      available: true,
    };
  } catch {
    return base;
  }
}

async function benchmarkStatus(memory, report = {}) {
  const comparison = report?.benchmark_comparison || null;
  const summary = report?.benchmark || {};
  let cadence = null;
  try {
    const rows = await memory?.recent?.({ limit: 1, kind: 'BENCHMARK_CADENCE' });
    cadence = readEvidence(Array.isArray(rows) ? rows[0] : null);
  } catch {}
  return {
    status: String(cadence?.status || (Number(summary?.runs || 0) > 0 ? 'MEASURED' : 'NO_MEASUREMENT')),
    due_reason: cadence?.due_reason || null,
    failure: cadence?.failure || null,
    evaluator_available: cadence?.evaluator_available === true,
    source_sha: cadence?.benchmark?.source_sha || cadence?.source_sha || null,
    measured_at: isoFromEpoch(cadence?.measured_at),
    runs: finiteNonNegativeInt(summary?.runs, 0),
    baseline_score: nullableNumber(summary?.baseline_score),
    latest_score: nullableNumber(summary?.latest_score),
    gain: nullableNumber(summary?.absolute_gain),
    domains: comparison?.domains && typeof comparison.domains === 'object' ? comparison.domains : {},
    cadence: {
      verified_jobs_since_benchmark: finiteNonNegativeInt(cadence?.verified_jobs_since_benchmark, 0),
      every_verified_jobs: finiteNonNegativeInt(cadence?.every_verified_jobs, 0),
      significant_corrections: finiteNonNegativeInt(cadence?.significant_corrections, 0),
    },
  };
}

function blockedLoraReason(plan, trainingExamples) {
  if (!plan) {
    return trainingExamples < 50
      ? `aucun plan persisté · corpus ${trainingExamples}/50 exemples validés`
      : 'aucun plan LoRA persisté · corpus suffisant mais entraînement/compatibilité non prouvés';
  }
  const readiness = plan.readiness || {};
  if (readiness.enough_examples !== true) return `corpus insuffisant · ${Number(plan.examples || trainingExamples || 0)}/${Number(readiness.min_examples || 50)}`;
  if (readiness.runtime_model_supported !== true) return 'modèle de base/runtime LoRA non compatible';
  if (readiness.cloudflare_inference_compatible !== true) return 'configuration non compatible avec l’inférence Cloudflare';
  return 'aucun adaptateur actif';
}

async function loraStatus(memory, report = {}) {
  const trainingExamples = finiteNonNegativeInt(report?.corrections_available_for_training, 0);
  const activeCount = finiteNonNegativeInt(report?.active_adapter_count, 0);
  if (activeCount > 0 && report?.neural_weights_changed === true) {
    const active = report?.active_adapter || null;
    return {
      state: 'ACTIVE',
      reason: 'adaptateur persisté actif après validation benchmark',
      active_adapter_count: activeCount,
      plan_id: active?.plan_id || null,
      adapter_id: active?.adapter?.id || null,
      base_model: active?.base_model || active?.adapter?.base_model || null,
      dataset_digest: active?.dataset_digest || null,
      activated_at: isoFromEpoch(active?.activated_at),
    };
  }

  let planRow = null;
  let evalRow = null;
  try {
    const [plans, evaluations] = await Promise.all([
      memory?.recent?.({ limit: 1, kind: 'LORA_PLAN' }),
      memory?.recent?.({ limit: 1, kind: 'LORA_ADAPTER_EVAL' }),
    ]);
    planRow = Array.isArray(plans) ? plans[0] : null;
    evalRow = Array.isArray(evaluations) ? evaluations[0] : null;
  } catch {}

  const plan = readEvidence(planRow);
  const evaluation = readEvidence(evalRow);
  if (evaluation && (!planRow || Number(evalRow?.created_at || 0) >= Number(planRow?.created_at || 0))) {
    const decision = evaluation?.decision || {};
    return {
      state: 'EVALUATED',
      reason: decision.promote === true
        ? 'évaluation persistée positive · activation non persistée'
        : `évaluation persistée · ${String(decision.reason || evalRow?.outcome || 'non promue')}`,
      active_adapter_count: 0,
      plan_id: evaluation?.plan?.id || plan?.id || null,
      adapter_id: evaluation?.artifact?.id || null,
      base_model: evaluation?.artifact?.base_model || evaluation?.plan?.base_model || null,
      dataset_digest: evaluation?.plan?.dataset_digest || null,
      evaluated_at: isoFromEpoch(evalRow?.created_at),
    };
  }

  const status = String(plan?.status || 'DRAFT').toUpperCase();
  if (status === 'TRAINING') {
    return {
      state: 'TRAINING',
      reason: 'plan LoRA persistant marqué en entraînement',
      active_adapter_count: 0,
      plan_id: plan?.id || null,
      base_model: plan?.base_model || null,
      dataset_digest: plan?.dataset_digest || null,
    };
  }
  if (['EVALUATING', 'APPROVED', 'REJECTED'].includes(status)) {
    return {
      state: 'EVALUATED',
      reason: `plan persistant ${status.toLowerCase()} · aucun adaptateur actif`,
      active_adapter_count: 0,
      plan_id: plan?.id || null,
      base_model: plan?.base_model || null,
      dataset_digest: plan?.dataset_digest || null,
    };
  }
  if (plan?.readiness?.ready_for_training === true && status === 'READY_FOR_TRAINING') {
    return {
      state: 'READY',
      reason: 'corpus et configuration du plan prêts · entraînement réel non encore prouvé',
      active_adapter_count: 0,
      plan_id: plan?.id || null,
      base_model: plan?.base_model || null,
      dataset_digest: plan?.dataset_digest || null,
    };
  }
  return {
    state: 'BLOCKED',
    reason: blockedLoraReason(plan, trainingExamples),
    active_adapter_count: 0,
    plan_id: plan?.id || null,
    base_model: plan?.base_model || null,
    dataset_digest: plan?.dataset_digest || null,
  };
}

/**
 * Builds the live learning state shown by /professor.
 *
 * The displayed XP is canonical when a verified XP journal checkpoint exists.
 * Project-experience memories are surfaced separately and NEVER converted into XP.
 * Benchmark and LoRA status are derived only from persisted learning evidence.
 */
export async function getLiveLearningProgress({ engine, db, now = () => new Date() } = {}) {
  if (!engine || typeof engine.report !== 'function') throw new Error('LEARNING_ENGINE_REQUIRED');

  const report = await engine.report();
  const observed = buildLearningProgress(report);
  const [checkpoint, projectExperience, benchmark, lora] = await Promise.all([
    latestVerifiedCheckpoint(engine.memory),
    projectExperienceStatus(db),
    benchmarkStatus(engine.memory, report),
    loraStatus(engine.memory, report),
  ]);

  const canonical = checkpoint ? applyCanonicalXp(observed, checkpoint.xp) : observed;

  return {
    ...canonical,
    canonical_xp: canonical.xp,
    observed_xp: observed.xp,
    xp_source: checkpoint ? 'verified-journal' : 'current-learning-report',
    xp_checkpoint: checkpoint,
    project_experience: projectExperience,
    benchmark_status: benchmark,
    lora_status: lora,
    measured_at: now().toISOString(),
  };
}

export const LIVE_PROGRESS_PROJECT_EXPERIENCE_SOURCE = PROJECT_EXPERIENCE_SOURCE;

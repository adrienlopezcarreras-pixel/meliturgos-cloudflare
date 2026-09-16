import { flattenRuntimeRoadmap } from '../roadmap/runtime-roadmap.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nonNegativeInt = (value) => Math.max(0, Math.trunc(finite(value, 0)));

function rankForLevel(level) {
  if (level >= 30) return 'Évolution';
  if (level >= 20) return 'Maîtrise';
  if (level >= 12) return 'Consolidation';
  if (level >= 6) return 'Apprentissage';
  return 'Éveil';
}

export const ROADMAP_XP_RULES = Object.freeze({
  DONE: 100,
  DONE_VERIFIED: 150
});

/**
 * Game-like MEL progression derived only from auditable evidence.
 * Roadmap work is included when it reaches DONE or DONE_VERIFIED.
 * PARTIAL / IN_PROGRESS / PLANNED / BLOCKED states award no roadmap XP.
 *
 * Learning evidence keeps the historical scoring model when a canonical
 * learning report is supplied. The current Gen2 runtime can therefore expose
 * honest roadmap XP now and add persisted learning evidence later without
 * changing level semantics.
 */
export function buildMelProgress({ learningReport = {}, roadmapRows = flattenRuntimeRoadmap() } = {}) {
  const validated = nonNegativeInt(learningReport.corrections_validated);
  const trainingReady = Math.min(validated, nonNegativeInt(learningReport.corrections_available_for_training));
  const trials = Math.min(100, nonNegativeInt(learningReport.inference_trials));
  const repeatedErrors = nonNegativeInt(learningReport.repeated_taught_errors);
  const activeAdapters = nonNegativeInt(learningReport.active_adapter_count);

  const benchmark = learningReport.benchmark || {};
  const baselineScore = Number.isFinite(Number(benchmark.baseline_score)) ? clamp(Number(benchmark.baseline_score), 0, 1) : null;
  const latestScore = Number.isFinite(Number(benchmark.latest_score)) ? clamp(Number(benchmark.latest_score), 0, 1) : null;
  const measuredGain = baselineScore != null && latestScore != null ? latestScore - baselineScore : null;
  const positiveGain = measuredGain == null ? 0 : Math.max(0, measuredGain);

  const rows = Array.isArray(roadmapRows) ? roadmapRows : [];
  const roadmapDone = rows.filter((row) => row?.status === 'DONE').length;
  const roadmapVerified = rows.filter((row) => row?.status === 'DONE_VERIFIED').length;
  const roadmapComplete = roadmapDone + roadmapVerified;

  const components = {
    validated_corrections_xp: validated * 80,
    training_ready_bonus_xp: trainingReady * 20,
    benchmark_gain_xp: Math.round(positiveGain * 2000),
    inference_trials_xp: trials * 10,
    neural_adapter_xp: activeAdapters > 0 ? 1000 : 0,
    roadmap_done_xp: roadmapDone * ROADMAP_XP_RULES.DONE,
    roadmap_verified_xp: roadmapVerified * ROADMAP_XP_RULES.DONE_VERIFIED,
    repeated_error_penalty_xp: repeatedErrors * 100
  };

  const learningXp = components.validated_corrections_xp
    + components.training_ready_bonus_xp
    + components.benchmark_gain_xp
    + components.inference_trials_xp
    + components.neural_adapter_xp
    - components.repeated_error_penalty_xp;
  const roadmapXp = components.roadmap_done_xp + components.roadmap_verified_xp;
  const xp = Math.max(0, learningXp + roadmapXp);

  const level = Math.min(99, Math.floor(Math.sqrt(xp / 250)) + 1);
  const levelStartXp = 250 * Math.pow(level - 1, 2);
  const nextLevelXp = level >= 99 ? levelStartXp : 250 * Math.pow(level, 2);
  const levelSpan = Math.max(1, nextLevelXp - levelStartXp);
  const levelProgress = level >= 99 ? 1 : clamp((xp - levelStartXp) / levelSpan, 0, 1);

  const learningEvidenceAvailable = [
    validated,
    trainingReady,
    trials,
    repeatedErrors,
    activeAdapters,
    nonNegativeInt(benchmark.runs)
  ].some((value) => value > 0) || baselineScore != null || latestScore != null;

  return {
    ok: true,
    kind: 'MEL_PROGRESS',
    source: 'learning-evidence+runtime-roadmap',
    roadmap_included: true,
    xp,
    level,
    rank: rankForLevel(level),
    level_start_xp: levelStartXp,
    next_level_xp: nextLevelXp,
    xp_into_level: Math.max(0, xp - levelStartXp),
    xp_to_next_level: level >= 99 ? 0 : Math.max(0, nextLevelXp - xp),
    level_progress: levelProgress,
    level_progress_percent: Math.round(levelProgress * 1000) / 10,
    learning_xp: Math.max(0, learningXp),
    roadmap_xp: roadmapXp,
    learning_evidence_available: learningEvidenceAvailable,
    xp_components: components,
    evidence: {
      corrections_validated: validated,
      corrections_available_for_training: trainingReady,
      benchmark_runs: nonNegativeInt(benchmark.runs),
      benchmark_baseline_score: baselineScore,
      benchmark_latest_score: latestScore,
      benchmark_gain: measuredGain,
      inference_trials: nonNegativeInt(learningReport.inference_trials),
      repeated_taught_errors: repeatedErrors,
      neural_weights_changed: learningReport.neural_weights_changed === true && activeAdapters > 0,
      active_adapter_count: activeAdapters,
      roadmap_total: rows.length,
      roadmap_done: roadmapDone,
      roadmap_verified: roadmapVerified,
      roadmap_complete: roadmapComplete,
      roadmap_percent_complete: rows.length ? Math.round((roadmapComplete / rows.length) * 100) : 0
    },
    rules: {
      roadmap_done_xp: ROADMAP_XP_RULES.DONE,
      roadmap_verified_xp: ROADMAP_XP_RULES.DONE_VERIFIED,
      partial_or_in_progress_xp: 0
    },
    semantics: {
      label: 'Progression MEL',
      is_game_scale: true,
      is_neural_capability_percentage: false,
      includes_verified_roadmap: true,
      note: 'L’XP additionne les preuves d’apprentissage disponibles et les tâches roadmap réellement terminées. Une tâche seulement planifiée ou en cours ne rapporte aucun XP.'
    }
  };
}

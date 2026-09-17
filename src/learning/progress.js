const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nonNegativeInt(value) {
  return Math.max(0, Math.trunc(finite(value, 0)));
}

function nullableMetric(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundMetric(value, precision = 12) {
  if (!Number.isFinite(Number(value))) return null;
  const factor = Math.pow(10, Math.max(0, Math.min(15, Math.trunc(precision))));
  return Math.round(Number(value) * factor) / factor;
}

function rankForLevel(level) {
  if (level >= 30) return 'Évolution';
  if (level >= 20) return 'Maîtrise';
  if (level >= 12) return 'Consolidation';
  if (level >= 6) return 'Apprentissage';
  return 'Éveil';
}

/**
 * Convert MEL's persisted learning evidence into a game-like XP/level view.
 *
 * This is deliberately NOT a capability score and NEVER consumes roadmap data.
 * XP is an auditable projection of learning evidence already produced by the
 * canonical LearningEngine:
 *   - 80 XP per validated correction;
 *   - +20 XP when that correction is good enough for the training corpus;
 *   - +2000 XP per +1.0 measured benchmark gain over the baseline;
 *   - +10 XP per measured inference trial (first 100 only);
 *   - +1000 XP when at least one benchmark-approved LoRA adapter is active;
 *   - -100 XP for each repeated taught error detected by canonical benchmarks.
 *
 * Levels use quadratic thresholds: level N starts at 250*(N-1)^2 XP.
 */
export function buildLearningProgress(report = {}) {
  const validated = nonNegativeInt(report.corrections_validated);
  const trainingReady = Math.min(validated, nonNegativeInt(report.corrections_available_for_training));
  const trials = Math.min(100, nonNegativeInt(report.inference_trials));
  const repeatedErrors = nonNegativeInt(report.repeated_taught_errors);
  const activeAdapters = nonNegativeInt(report.active_adapter_count);

  const benchmark = report.benchmark || {};
  const baselineValue = nullableMetric(benchmark.baseline_score);
  const latestValue = nullableMetric(benchmark.latest_score);
  const baselineScore = baselineValue == null ? null : clamp(baselineValue, 0, 1);
  const latestScore = latestValue == null ? null : clamp(latestValue, 0, 1);
  const measuredGain = baselineScore != null && latestScore != null
    ? roundMetric(latestScore - baselineScore)
    : null;
  const positiveGain = measuredGain == null ? 0 : Math.max(0, measuredGain);

  const components = {
    validated_corrections_xp: validated * 80,
    training_ready_bonus_xp: trainingReady * 20,
    benchmark_gain_xp: Math.round(positiveGain * 2000),
    inference_trials_xp: trials * 10,
    neural_adapter_xp: activeAdapters > 0 ? 1000 : 0,
    repeated_error_penalty_xp: repeatedErrors * 100,
  };

  const earnedBeforePenalty = components.validated_corrections_xp
    + components.training_ready_bonus_xp
    + components.benchmark_gain_xp
    + components.inference_trials_xp
    + components.neural_adapter_xp;
  const xp = Math.max(0, earnedBeforePenalty - components.repeated_error_penalty_xp);

  const level = Math.min(99, Math.floor(Math.sqrt(xp / 250)) + 1);
  const levelStartXp = 250 * Math.pow(level - 1, 2);
  const nextLevelXp = level >= 99 ? levelStartXp : 250 * Math.pow(level, 2);
  const levelSpan = Math.max(1, nextLevelXp - levelStartXp);
  const levelProgress = level >= 99 ? 1 : clamp((xp - levelStartXp) / levelSpan, 0, 1);

  return {
    kind: 'MEL_LEARNING_PROGRESS',
    source: 'canonical-learning-engine',
    roadmap_included: false,
    xp,
    level,
    rank: rankForLevel(level),
    level_start_xp: levelStartXp,
    next_level_xp: nextLevelXp,
    xp_into_level: Math.max(0, xp - levelStartXp),
    xp_to_next_level: level >= 99 ? 0 : Math.max(0, nextLevelXp - xp),
    level_progress: levelProgress,
    level_progress_percent: Math.round(levelProgress * 1000) / 10,
    evidence: {
      corrections_recorded: nonNegativeInt(report.corrections_recorded),
      corrections_validated: validated,
      corrections_available_for_training: trainingReady,
      validation_rate: clamp(finite(report.validation_rate, 0), 0, 1),
      average_validated_quality: clamp(finite(report.average_validated_quality, 0), 0, 1),
      benchmark_runs: nonNegativeInt(benchmark.runs),
      benchmark_baseline_score: baselineScore,
      benchmark_latest_score: latestScore,
      benchmark_gain: measuredGain,
      inference_trials: nonNegativeInt(report.inference_trials),
      repeated_taught_errors: repeatedErrors,
      neural_weights_changed: report.neural_weights_changed === true && activeAdapters > 0,
      active_adapter_count: activeAdapters,
    },
    xp_components: components,
    semantics: {
      label: 'Progression d’apprentissage MEL',
      is_game_scale: true,
      is_neural_capability_percentage: false,
      is_roadmap_percentage: false,
      note: 'Les niveaux gamifient uniquement des preuves d’apprentissage persistées; ils ne mesurent ni la feuille de route ni un QI/capacité neuronale absolue.',
    },
  };
}

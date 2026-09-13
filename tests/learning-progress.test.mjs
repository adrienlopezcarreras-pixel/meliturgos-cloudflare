import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLearningProgress } from '../src/learning/progress.js';

test('learning XP is derived from persisted learning evidence', () => {
  const result = buildLearningProgress({
    corrections_recorded: 5,
    corrections_validated: 4,
    corrections_available_for_training: 3,
    validation_rate: 0.8,
    average_validated_quality: 0.9,
    inference_trials: 3,
    repeated_taught_errors: 1,
    active_adapter_count: 0,
    neural_weights_changed: false,
    benchmark: {
      runs: 2,
      baseline_score: 0.6,
      latest_score: 0.8,
    },
  });

  // 4*80 + 3*20 + 0.2*2000 + 3*10 - 1*100 = 710 XP.
  assert.equal(result.xp, 710);
  assert.equal(result.level, 2);
  assert.equal(result.evidence.corrections_validated, 4);
  assert.ok(Math.abs(result.evidence.benchmark_gain - 0.2) < 1e-12);
  assert.equal(result.evidence.neural_weights_changed, false);
  assert.equal(result.roadmap_included, false);
});

test('roadmap fields cannot change learning XP or level', () => {
  const evidence = {
    corrections_recorded: 2,
    corrections_validated: 2,
    corrections_available_for_training: 2,
    inference_trials: 0,
    repeated_taught_errors: 0,
    active_adapter_count: 0,
    benchmark: { runs: 0, baseline_score: null, latest_score: null },
  };
  const lowRoadmap = buildLearningProgress({ ...evidence, roadmap_percent: 0, percent_complete: 0 });
  const highRoadmap = buildLearningProgress({ ...evidence, roadmap_percent: 100, percent_complete: 100, roadmap: { done: 9999 } });

  assert.equal(lowRoadmap.xp, highRoadmap.xp);
  assert.equal(lowRoadmap.level, highRoadmap.level);
  assert.equal(lowRoadmap.xp, 200);
});

test('repeated taught errors penalize XP and active validated adapter is explicit', () => {
  const base = {
    corrections_recorded: 10,
    corrections_validated: 10,
    corrections_available_for_training: 10,
    inference_trials: 4,
    repeated_taught_errors: 2,
    active_adapter_count: 1,
    neural_weights_changed: true,
    benchmark: { runs: 2, baseline_score: 0.7, latest_score: 0.75 },
  };
  const result = buildLearningProgress(base);

  assert.equal(result.xp_components.neural_adapter_xp, 1000);
  assert.equal(result.xp_components.repeated_error_penalty_xp, 200);
  assert.equal(result.evidence.neural_weights_changed, true);
  assert.ok(result.xp > 0);
});

test('empty evidence remains honest instead of fabricating progress', () => {
  const result = buildLearningProgress({});
  assert.equal(result.xp, 0);
  assert.equal(result.level, 1);
  assert.equal(result.level_progress_percent, 0);
  assert.equal(result.evidence.benchmark_latest_score, null);
  assert.equal(result.evidence.neural_weights_changed, false);
});

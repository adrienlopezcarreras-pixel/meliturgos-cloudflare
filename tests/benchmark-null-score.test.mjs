import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLearningProgress } from '../src/learning/progress.js';
import { getLiveLearningProgress } from '../src/learning/live-progress.js';

function emptyReport() {
  return {
    corrections_recorded: 0,
    corrections_validated: 0,
    corrections_available_for_training: 0,
    inference_trials: 0,
    repeated_taught_errors: 0,
    active_adapter_count: 0,
    neural_weights_changed: false,
    benchmark: {
      runs: 0,
      baseline_score: null,
      latest_score: null,
      absolute_gain: null,
    },
  };
}

test('explicit null benchmark scores remain unmeasured instead of becoming zero percent', () => {
  const progress = buildLearningProgress(emptyReport());
  assert.equal(progress.evidence.benchmark_runs, 0);
  assert.equal(progress.evidence.benchmark_baseline_score, null);
  assert.equal(progress.evidence.benchmark_latest_score, null);
  assert.equal(progress.evidence.benchmark_gain, null);
});

test('live benchmark status preserves null scores when no measurement exists', async () => {
  const memory = { recent: async () => [] };
  const engine = { memory, report: async () => emptyReport() };
  const live = await getLiveLearningProgress({ engine, db: null, now: () => new Date('2026-09-17T21:50:00Z') });
  assert.equal(live.benchmark_status.status, 'NO_MEASUREMENT');
  assert.equal(live.benchmark_status.runs, 0);
  assert.equal(live.benchmark_status.baseline_score, null);
  assert.equal(live.benchmark_status.latest_score, null);
  assert.equal(live.benchmark_status.gain, null);
});

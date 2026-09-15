import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyCanonicalXp,
  getLiveLearningProgress,
  LIVE_PROGRESS_PROJECT_EXPERIENCE_SOURCE,
} from '../src/learning/live-progress.js';

function report(overrides = {}) {
  return {
    corrections_recorded: 1,
    corrections_validated: 1,
    corrections_available_for_training: 1,
    validation_rate: 1,
    average_validated_quality: 1,
    inference_trials: 0,
    repeated_taught_errors: 0,
    active_adapter_count: 0,
    neural_weights_changed: false,
    benchmark: { runs: 0, baseline_score: null, latest_score: null },
    ...overrides,
  };
}

test('canonical XP keeps the same level semantics as the learning meter', () => {
  const progress = applyCanonicalXp({ xp: 0 }, 800);
  assert.equal(progress.xp, 800);
  assert.equal(progress.level, 2);
  assert.equal(progress.rank, 'Éveil');
  assert.equal(progress.level_progress_percent, 73.3);
  assert.equal(progress.xp_to_next_level, 200);
});

test('live progress prefers the persisted verified XP journal and exposes project lessons separately', async () => {
  const engine = {
    report: async () => report(),
    memory: {
      recent: async ({ kind }) => {
        assert.equal(kind, 'LEARNING_XP_CHECKPOINT');
        return [{
          created_at: '2026-09-15T18:00:00.000Z',
          evidence_json: JSON.stringify({
            xp_after: 1800,
            observed_xp: 100,
            recorded_at: '2026-09-15T18:00:00.000Z',
            source_sha: 'abc123',
            awarded: true,
          }),
        }];
      },
    },
  };
  const db = {
    prepare(sql) {
      assert.match(sql, /FROM memories WHERE source = \?/);
      return {
        bind(source) {
          assert.equal(source, LIVE_PROGRESS_PROJECT_EXPERIENCE_SOURCE);
          return { first: async () => ({ count: 48 }) };
        },
      };
    },
  };

  const progress = await getLiveLearningProgress({
    engine,
    db,
    now: () => new Date('2026-09-15T20:00:00.000Z'),
  });

  assert.equal(progress.observed_xp, 100);
  assert.equal(progress.canonical_xp, 1800);
  assert.equal(progress.xp, 1800);
  assert.equal(progress.xp_source, 'verified-journal');
  assert.equal(progress.project_experience.count, 48);
  assert.equal(progress.project_experience.available, true);
  assert.equal(progress.measured_at, '2026-09-15T20:00:00.000Z');
});

test('project lessons never create XP and current report remains fallback without a checkpoint', async () => {
  const engine = {
    report: async () => report({
      corrections_recorded: 2,
      corrections_validated: 2,
      corrections_available_for_training: 2,
    }),
    memory: { recent: async () => [] },
  };
  const db = {
    prepare() {
      return { bind: () => ({ first: async () => ({ count: 48 }) }) };
    },
  };

  const progress = await getLiveLearningProgress({ engine, db });

  assert.equal(progress.observed_xp, 200);
  assert.equal(progress.canonical_xp, 200);
  assert.equal(progress.xp, 200);
  assert.equal(progress.project_experience.count, 48);
  assert.equal(progress.xp_source, 'current-learning-report');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { LearningEngine } from '../src/learning/learning-engine.js';

class FakeMemory {
  constructor() { this.rows = []; }
  async remember(row = {}) {
    const stored = { id: row.id || String(this.rows.length + 1), created_at: row.created_at || Date.now(), ...row };
    this.rows.unshift(stored);
    return structuredClone(stored);
  }
  async recent({ limit = 12, kind = null, outcome = null } = {}) {
    return this.rows.filter((row) => !kind || row.kind === kind).filter((row) => !outcome || row.outcome === outcome).slice(0, limit).map((row) => structuredClone(row));
  }
}

test('benchmark cadence waits until five verified jobs when no significant correction exists', async () => {
  const engine = new LearningEngine({ memory: new FakeMemory() });
  let state;
  for (let index = 0; index < 5; index += 1) {
    state = await engine.advanceBenchmarkCadence({ verifiedJobsDelta: 1 });
    if (index < 4) assert.equal(state.status, 'NOT_DUE');
  }
  assert.equal(state.status, 'SKIPPED_EVALUATOR_UNAVAILABLE');
  assert.equal(state.due_reason, 'VERIFIED_JOB_CADENCE');
  assert.equal(state.verified_jobs_since_benchmark, 5);
  assert.equal(state.evaluator_available, false);
});

test('significant verified corrections make benchmark due but never invent a score without evaluator', async () => {
  const engine = new LearningEngine({ memory: new FakeMemory() });
  const state = await engine.advanceBenchmarkCadence({ verifiedJobsDelta: 1, significantCorrections: 2, source_sha: 'a'.repeat(40) });
  assert.equal(state.status, 'SKIPPED_EVALUATOR_UNAVAILABLE');
  assert.equal(state.due_reason, 'SIGNIFICANT_CORRECTION_BATCH');
  assert.equal(state.benchmark, null);
  assert.equal(state.verified_jobs_since_benchmark, 1);
});

test('available evaluator runs canonical benchmark, persists repeated taught errors and resets cadence', async () => {
  const memory = new FakeMemory();
  const engine = new LearningEngine({ memory });
  const state = await engine.advanceBenchmarkCadence({
    verifiedJobsDelta: 1,
    significantCorrections: 1,
    source_sha: 'b'.repeat(40),
    evaluator: async (testCase) => ({
      score: 1,
      repeated_error: testCase.domain === 'taught_error_correction',
      evidence: 'deterministic-test-evaluator',
    }),
  });
  assert.equal(state.status, 'RAN');
  assert.equal(state.verified_jobs_since_benchmark, 0);
  assert.equal(state.benchmark.cases, 7);
  assert.equal(state.benchmark.overall, 1);
  assert.equal(state.repeated_taught_errors, 1);
  assert.ok(memory.rows.some((row) => row.kind === 'LEARNING_BENCHMARK'));
  assert.ok(memory.rows.some((row) => row.kind === 'BENCHMARK_CADENCE'));
});

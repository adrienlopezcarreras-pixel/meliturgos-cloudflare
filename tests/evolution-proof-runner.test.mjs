import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_LEARNING_BENCHMARK_SUITE,
  benchmarkSuiteFingerprint,
} from '../src/evaluation/benchmarks.js';
import { runEvolutionProofLoop } from '../src/evolution/evolution-proof-runner.js';
import { flattenRoadmap, ROADMAP_REGISTRY_REVISION } from '../src/roadmap/master-roadmap.js';

const SOURCE_SHA = 'a'.repeat(40);
const suiteDigest = benchmarkSuiteFingerprint(CANONICAL_LEARNING_BENCHMARK_SUITE);

function baseline(score = 0.8) {
  const domains = Object.fromEntries(
    CANONICAL_LEARNING_BENCHMARK_SUITE.map((row) => [row.domain, { score, cases: 1 }]),
  );
  return {
    suite_id: 'mel-learning-canonical-v1',
    suite_digest: suiteDigest,
    overall: score,
    cases: CANONICAL_LEARNING_BENCHMARK_SUITE.length,
    domains,
    repeated_errors: [],
  };
}

function passingEvaluator(score = 0.9) {
  return async (testCase) => ({
    score,
    repeated_error: false,
    evidence: `benchmark:${testCase.id}`,
  });
}

const approveCritic = async () => ({ approved: true, artifacts: ['critic:approved'], production_touched: false });

test('verifies in one cycle by reusing canonical benchmark and regression gates', async () => {
  let corrections = 0;
  const result = await runEvolutionProofLoop({
    source_sha: SOURCE_SHA,
    baseline: baseline(),
    state: { revision: 1 },
    artifacts: ['ci:targeted-tests'],
    testRunner: async () => ({ passed: true, artifacts: ['tests:pass'], production_touched: false }),
    benchmarkEvaluator: passingEvaluator(),
    critic: approveCritic,
    corrector: async () => { corrections += 1; return { state: { revision: 2 }, production_touched: false }; },
  });

  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.decision, 'ALLOW');
  assert.equal(result.cycles, 1);
  assert.equal(corrections, 0);
  assert.equal(result.history[0].benchmark.suite_digest, suiteDigest);
  assert.equal(result.history[0].regression.allowed, true);
  assert.equal(result.production_touched, false);
});

test('runs a bounded correction then verifies the corrected state', async () => {
  const seen = [];
  const result = await runEvolutionProofLoop({
    source_sha: SOURCE_SHA,
    baseline: baseline(),
    state: { fixed: false },
    artifacts: ['proof:initial'],
    maxCycles: 3,
    testRunner: async ({ state }) => ({
      passed: state.fixed === true,
      code: state.fixed ? null : 'TARGETED_TEST_FAILED',
      artifacts: [state.fixed ? 'tests:fixed' : 'tests:failed'],
      production_touched: false,
    }),
    benchmarkEvaluator: async (testCase, { state }) => ({ score: state.fixed ? 0.9 : 0.7, evidence: testCase.id }),
    critic: async ({ tests, regression }) => ({
      approved: tests.passed && regression?.allowed === true,
      issues: tests.passed ? [] : ['repair targeted test failure'],
      production_touched: false,
    }),
    corrector: async ({ cycle, state }) => {
      seen.push({ cycle, fixed: state.fixed });
      return { state: { ...state, fixed: true }, code: 'TARGETED_REPAIR', artifacts: ['repair:1'], production_touched: false };
    },
  });

  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.cycles, 2);
  assert.deepEqual(seen, [{ cycle: 1, fixed: false }]);
  assert.equal(result.history[0].corrected, true);
  assert.equal(result.history[1].tests.passed, true);
});

test('fails closed when regression remains and no corrector is available', async () => {
  const result = await runEvolutionProofLoop({
    source_sha: SOURCE_SHA,
    baseline: baseline(0.9),
    state: { revision: 1 },
    artifacts: ['tests:evidence'],
    testRunner: async () => ({ passed: true, artifacts: ['tests:pass'], production_touched: false }),
    benchmarkEvaluator: passingEvaluator(0.5),
    critic: approveCritic,
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.code, 'EVOLUTION_CORRECTOR_REQUIRED');
  assert.equal(result.history[0].regression.allowed, false);
  assert.ok(result.history[0].regression.blockers.some((row) => row.code === 'OVERALL_REGRESSION'));
});

test('stops at the configured correction cycle limit', async () => {
  const result = await runEvolutionProofLoop({
    source_sha: SOURCE_SHA,
    baseline: baseline(),
    state: { revision: 0 },
    artifacts: ['proof:bounded'],
    maxCycles: 2,
    testRunner: async () => ({ passed: false, code: 'STILL_FAILING', artifacts: ['tests:failed'], production_touched: false }),
    benchmarkEvaluator: passingEvaluator(),
    critic: async () => ({ approved: false, issues: ['still failing'], production_touched: false }),
    corrector: async ({ state }) => ({ state: { revision: state.revision + 1 }, production_touched: false }),
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.code, 'EVOLUTION_PROOF_CYCLE_LIMIT');
  assert.equal(result.cycles, 2);
  assert.equal(result.history[0].corrected, true);
  assert.equal(result.history[1].corrected, false);
});

test('rejects a correction that cannot attest candidate-only safety', async () => {
  const result = await runEvolutionProofLoop({
    source_sha: SOURCE_SHA,
    baseline: baseline(),
    state: { revision: 0 },
    artifacts: ['proof:safety'],
    testRunner: async () => ({ passed: false, artifacts: ['tests:failed'], production_touched: false }),
    benchmarkEvaluator: passingEvaluator(),
    critic: async () => ({ approved: false, production_touched: false }),
    corrector: async () => ({ state: { revision: 1 } }),
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.code, 'EVOLUTION_CORRECTION_SAFETY_ATTESTATION_REQUIRED');
  assert.equal(result.production_touched, false);
});

test('requires exact source SHA and all proof dependencies', async () => {
  await assert.rejects(
    () => runEvolutionProofLoop({ source_sha: 'short', baseline: baseline(), state: {} }),
    (error) => error.code === 'EVOLUTION_SOURCE_SHA_REQUIRED',
  );
  await assert.rejects(
    () => runEvolutionProofLoop({ source_sha: SOURCE_SHA, baseline: baseline(), state: {} }),
    (error) => error.code === 'EVOLUTION_TEST_RUNNER_REQUIRED',
  );
});

test('roadmap source tracks MEL-EVOL-03 through the unique proof-runner procedure', () => {
  const row = flattenRoadmap().find((item) => item.id === 'MEL-EVOL-03');
  assert.ok(row);
  assert.ok(['IN_PROGRESS', 'DONE_VERIFIED'].includes(row.status));
  assert.match(row.next, /Runner unique|preuve/i);
  assert.match(ROADMAP_REGISTRY_REVISION, /^2026-09-16\./);
});

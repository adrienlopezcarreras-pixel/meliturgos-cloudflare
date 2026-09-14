import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkSuiteFingerprint, CANONICAL_LEARNING_BENCHMARK_SUITE } from '../src/evaluation/benchmarks.js';
import { buildBenchmarkComparisonEvidence, persistBenchmarkComparisonEvidence } from '../src/evaluation/benchmark-evidence.js';

const digest = benchmarkSuiteFingerprint(CANONICAL_LEARNING_BENCHMARK_SUITE);
const run = (overall, domainScores, repeated_errors = []) => ({
  suite_id: 'mel-learning-canonical-v1',
  suite_digest: digest,
  overall,
  cases: CANONICAL_LEARNING_BENCHMARK_SUITE.length,
  repeated_errors,
  domains: Object.fromEntries(Object.entries(domainScores).map(([k, score]) => [k, { score, cases: 1 }])),
});

test('benchmark comparison becomes XP-eligible only for evidenced non-regressive gain', () => {
  const baseline = run(0.7, { memory_provenance: 0.7, non_regression: 0.8 });
  const candidate = run(0.8, { memory_provenance: 0.8, non_regression: 0.8 });
  const evidence = buildBenchmarkComparisonEvidence({ baseline, candidate, artifacts: ['ci:123'], source_sha: 'abc', now: () => new Date('2026-09-14T02:00:00Z') });
  assert.equal(evidence.xp_eligible, true);
  assert.equal(evidence.comparison.delta > 0, true);
  assert.deepEqual(evidence.domain_regressions, []);
  assert.equal(evidence.suite_digest, digest);
});

test('domain regression, repeated taught error, or missing durable proof blocks XP eligibility', () => {
  const baseline = run(0.7, { memory_provenance: 0.8, non_regression: 0.7 });
  const regressed = run(0.75, { memory_provenance: 0.7, non_regression: 0.9 });
  assert.equal(buildBenchmarkComparisonEvidence({ baseline, candidate: regressed, artifacts: ['ci:1'] }).xp_eligible, false);
  const repeated = run(0.8, { memory_provenance: 0.9, non_regression: 0.8 }, ['taught-error-correction-01']);
  assert.equal(buildBenchmarkComparisonEvidence({ baseline, candidate: repeated, artifacts: ['ci:1'] }).xp_eligible, false);
  const clean = run(0.8, { memory_provenance: 0.9, non_regression: 0.8 });
  assert.equal(buildBenchmarkComparisonEvidence({ baseline, candidate: clean, artifacts: [] }).xp_eligible, false);
});

test('comparison persistence uses learning memory without defining a parallel benchmark suite', async () => {
  const remembered = [];
  const memory = { remember: async row => remembered.push(row) };
  const baseline = run(0.6, { memory_provenance: 0.6, non_regression: 0.7 });
  const candidate = run(0.7, { memory_provenance: 0.7, non_regression: 0.7 });
  const evidence = await persistBenchmarkComparisonEvidence({ memory, baseline, candidate, artifacts: ['full-candidate-ci:green'] });
  assert.equal(remembered.length, 1);
  assert.equal(remembered[0].kind, 'LEARNING_BENCHMARK_COMPARISON');
  assert.equal(remembered[0].evidence.suite_id, 'mel-learning-canonical-v1');
  assert.equal(evidence.xp_eligible, true);
});

test('suite digest mismatch fails closed', () => {
  const baseline = run(0.6, { memory_provenance: 0.6 });
  const candidate = { ...run(0.7, { memory_provenance: 0.7 }), suite_digest: 'wrong' };
  assert.throws(() => buildBenchmarkComparisonEvidence({ baseline, candidate, artifacts: ['x'] }), /BENCHMARK_SUITE_DIGEST_MISMATCH/);
});

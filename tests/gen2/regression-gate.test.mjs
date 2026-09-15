import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CANONICAL_LEARNING_BENCHMARK_SUITE,
  REQUIRED_LEARNING_BENCHMARK_DOMAINS,
  benchmarkSuiteFingerprint,
} from '../../src/evaluation/benchmarks.js';
import {
  DEFAULT_REGRESSION_POLICY,
  REGRESSION_GATE_SCHEMA,
  assertRegressionGate,
  evaluateRegressionGate,
  normalizeRegressionPolicy,
} from '../../src/evaluation/regression.js';

const digest = benchmarkSuiteFingerprint(CANONICAL_LEARNING_BENCHMARK_SUITE);
const fixedNow = () => new Date('2026-09-15T18:30:00.000Z');

function domains(score, overrides = {}) {
  return Object.fromEntries(REQUIRED_LEARNING_BENCHMARK_DOMAINS.map((domain) => [
    domain,
    { score: overrides[domain] ?? score, cases: 1 },
  ]));
}

function benchmarkRun({ overall = 0.9, domainScore = overall, domainOverrides = {}, repeated_errors = [], cases = CANONICAL_LEARNING_BENCHMARK_SUITE.length, suite_digest = digest, suite_id = 'mel-learning-canonical-v1' } = {}) {
  return {
    suite_id,
    suite_digest,
    cases,
    overall,
    domains: domains(domainScore, domainOverrides),
    repeated_errors,
  };
}

const audit = {
  source_sha: '1234567890abcdef1234567890abcdef12345678',
  artifacts: ['ci://benchmark/before-after.json'],
  now: fixedNow,
};

test('MEL-EVAL-03 allows a measured change when regressions stay inside policy thresholds', () => {
  const gate = evaluateRegressionGate({
    baseline: benchmarkRun({ overall: 0.9 }),
    candidate: benchmarkRun({ overall: 0.89 }),
    ...audit,
  });

  assert.equal(gate.schema, REGRESSION_GATE_SCHEMA);
  assert.equal(gate.allowed, true);
  assert.equal(gate.decision, 'ALLOW');
  assert.equal(gate.blockers.length, 0);
  assert.equal(gate.evaluated_at, '2026-09-15T18:30:00.000Z');
  assert.ok(gate.comparison.delta < 0);
  assert.ok(gate.comparison.delta > -DEFAULT_REGRESSION_POLICY.max_overall_drop);
});

test('MEL-EVAL-03 blocks a significant overall quality regression', () => {
  const gate = evaluateRegressionGate({
    baseline: benchmarkRun({ overall: 0.9, domainScore: 0.9 }),
    candidate: benchmarkRun({ overall: 0.87, domainScore: 0.87 }),
    ...audit,
  });

  assert.equal(gate.allowed, false);
  assert.equal(gate.decision, 'BLOCK');
  assert.ok(gate.blockers.some((row) => row.code === 'OVERALL_REGRESSION'));
});

test('MEL-EVAL-03 blocks a domain regression even when the aggregate score improves', () => {
  const gate = evaluateRegressionGate({
    baseline: benchmarkRun({ overall: 0.8, domainScore: 0.8 }),
    candidate: benchmarkRun({
      overall: 0.85,
      domainScore: 0.9,
      domainOverrides: { code_development: 0.7 },
    }),
    ...audit,
  });

  assert.equal(gate.allowed, false);
  const blocker = gate.blockers.find((row) => row.code === 'DOMAIN_REGRESSION');
  assert.equal(blocker.domain, 'code_development');
  assert.ok(blocker.delta < -0.05);
});

test('MEL-EVAL-03 blocks recurrence of a previously verified error', () => {
  const gate = evaluateRegressionGate({
    baseline: benchmarkRun(),
    candidate: benchmarkRun({ overall: 0.95, repeated_errors: ['taught-error-correction-01'] }),
    ...audit,
  });

  assert.equal(gate.allowed, false);
  assert.deepEqual(gate.repeated_errors, ['taught-error-correction-01']);
  assert.ok(gate.blockers.some((row) => row.code === 'REPEATED_VERIFIED_ERROR'));
});

test('MEL-EVAL-03 fails closed on missing provenance, suite identity, coverage or domain scores', () => {
  const baseline = benchmarkRun();
  const candidate = benchmarkRun({ cases: CANONICAL_LEARNING_BENCHMARK_SUITE.length - 1, suite_digest: '' });
  delete candidate.domains.memory_provenance;

  const gate = evaluateRegressionGate({ baseline, candidate, now: fixedNow });
  const codes = new Set(gate.blockers.map((row) => row.code));

  assert.equal(gate.allowed, false);
  assert.ok(codes.has('BENCHMARK_SUITE_DIGEST_REQUIRED'));
  assert.ok(codes.has('BENCHMARK_CASE_COUNT_MISMATCH'));
  assert.ok(codes.has('CANDIDATE_DOMAIN_SCORE_REQUIRED'));
  assert.ok(codes.has('SOURCE_SHA_REQUIRED'));
  assert.ok(codes.has('REGRESSION_EVIDENCE_REQUIRED'));
});

test('MEL-EVAL-03 supports stricter or domain-specific regression budgets', () => {
  const baseline = benchmarkRun({ overall: 0.9, domainScore: 0.9 });
  const candidate = benchmarkRun({
    overall: 0.88,
    domainScore: 0.9,
    domainOverrides: { instruction_following: 0.82 },
  });

  const relaxedDomain = evaluateRegressionGate({
    baseline,
    candidate,
    policy: {
      max_overall_drop: 0.03,
      domain_max_drop: { instruction_following: 0.1 },
    },
    ...audit,
  });
  assert.equal(relaxedDomain.allowed, true);

  const strictOverall = evaluateRegressionGate({
    baseline,
    candidate,
    policy: { max_overall_drop: 0.005 },
    ...audit,
  });
  assert.equal(strictOverall.allowed, false);
  assert.ok(strictOverall.blockers.some((row) => row.code === 'OVERALL_REGRESSION'));
});

test('MEL-EVAL-03 assert helper makes blocked promotions impossible to ignore', () => {
  assert.throws(
    () => assertRegressionGate({
      baseline: benchmarkRun({ overall: 0.9 }),
      candidate: benchmarkRun({ overall: 0.5 }),
      ...audit,
    }),
    (error) => error?.code === 'REGRESSION_GATE_BLOCKED' && Array.isArray(error?.blockers),
  );

  const allowed = assertRegressionGate({ baseline: benchmarkRun(), candidate: benchmarkRun({ overall: 0.91 }), ...audit });
  assert.equal(allowed.allowed, true);
});

test('MEL-EVAL-03 rejects malformed policy thresholds instead of silently weakening the gate', () => {
  assert.throws(
    () => normalizeRegressionPolicy({ max_domain_drop: -1 }),
    (error) => error?.code === 'REGRESSION_DOMAIN_THRESHOLD_INVALID',
  );
  assert.throws(
    () => normalizeRegressionPolicy({ domain_max_drop: { code_development: 2 } }),
    (error) => error?.code === 'REGRESSION_DOMAIN_THRESHOLD_INVALID',
  );
});

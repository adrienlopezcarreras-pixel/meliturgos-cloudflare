import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MEL_STABLE_EVAL_DOMAINS,
  MEL_STABLE_EVAL_SUITE_ID,
  compareStableEvalRuns,
  runStableEvalSuite,
  scoreStableEvalResults,
  stableEvalSuite,
  stableEvalSuiteFingerprint,
  validateStableEvalSuite,
} from '../../src/evaluation/stable-eval-suite.js';

test('stable eval suite covers conversation, code, search and memory with deterministic fingerprint', () => {
  const suite = stableEvalSuite();
  const validated = validateStableEvalSuite(suite);

  assert.equal(validated.suite_id, MEL_STABLE_EVAL_SUITE_ID);
  assert.equal(validated.cases, 8);
  assert.deepEqual(new Set(validated.domains), new Set(MEL_STABLE_EVAL_DOMAINS));
  assert.match(validated.fingerprint, /^fnv1a-[a-f0-9]{8}$/);
  assert.equal(stableEvalSuiteFingerprint(suite), stableEvalSuiteFingerprint(structuredClone(suite)));
});

test('stable eval suite fails closed if a required domain disappears', () => {
  const suite = stableEvalSuite().filter(row => row.domain !== 'memory');
  assert.throws(
    () => validateStableEvalSuite(suite),
    error => error?.code === 'STABLE_EVAL_DOMAINS_MISSING'
      && error?.missing?.includes('memory'),
  );
});

test('scoreStableEvalResults aggregates weighted domain scores and critical failures', () => {
  const suite = stableEvalSuite();
  const results = suite.map(row => ({
    id: row.id,
    score: row.id === 'memory-contradiction' ? 0.4 : 1,
    latency_ms: 100,
  }));
  const scored = scoreStableEvalResults(results, suite);

  assert.equal(scored.complete, true);
  assert.equal(scored.case_count, suite.length);
  assert.ok(scored.overall > 0.8 && scored.overall < 1);
  assert.equal(scored.domains.memory.critical_failures, 1);
  assert.equal(scored.domains.memory.avg_latency_ms, 100);
});

test('runStableEvalSuite uses domain-specific evaluators and preserves evidence', async () => {
  const calls = [];
  const result = await runStableEvalSuite({
    metadata: { source_sha: 'abc123', trigger: 'ci' },
    evaluators: {
      conversation: async testCase => {
        calls.push(testCase.domain);
        return { score: 0.9, evidence: { transcript: testCase.id } };
      },
      code: async testCase => {
        calls.push(testCase.domain);
        return { score: 0.95, evidence: { test: testCase.id } };
      },
      search: async testCase => {
        calls.push(testCase.domain);
        return { score: 0.85, evidence: { sources: 2 } };
      },
      memory: async testCase => {
        calls.push(testCase.domain);
        return { score: 0.92, evidence: { provenance: true } };
      },
    },
  });

  assert.equal(result.complete, true);
  assert.equal(result.case_count, 8);
  assert.equal(calls.length, 8);
  assert.equal(result.metadata.source_sha, 'abc123');
  assert.equal(result.results.find(row => row.id === 'memory-provenance').evidence.provenance, true);
});

test('missing evaluator is explicit and makes the evaluation non-promotable', async () => {
  const result = await runStableEvalSuite({
    evaluators: {
      conversation: async () => 1,
      code: async () => 1,
      search: async () => 1,
    },
  });

  assert.equal(result.complete, true);
  assert.equal(result.domains.memory.score, 0);
  assert.equal(result.results.filter(row => row.error === 'EVALUATOR_MISSING:memory').length, 2);

  const comparison = compareStableEvalRuns(result, result);
  assert.equal(comparison.promotable, false);
  assert.ok(comparison.reasons.includes('memory:DOMAIN_BELOW_FLOOR'));
  assert.ok(comparison.reasons.includes('memory:CRITICAL_CASE_FAILURE'));
});

test('candidate with small tolerated variation remains promotable', () => {
  const baseline = scoreStableEvalResults(stableEvalSuite().map(row => ({
    id: row.id,
    score: 0.9,
    latency_ms: 100,
  })));

  const candidate = scoreStableEvalResults(stableEvalSuite().map(row => ({
    id: row.id,
    score: row.domain === 'search' ? 0.88 : 0.9,
    latency_ms: 90,
  })));

  const comparison = compareStableEvalRuns(baseline, candidate, {
    maxOverallDrop: 0.02,
    maxDomainDrop: 0.05,
    minimumDomainScore: 0.7,
  });

  assert.equal(comparison.promotable, true);
  assert.equal(comparison.regression, false);
});

test('candidate domain regression blocks promotion even if overall score stays high', () => {
  const suite = stableEvalSuite();
  const baseline = scoreStableEvalResults(suite.map(row => ({
    id: row.id,
    score: 0.95,
    latency_ms: 100,
  })), suite);

  const candidate = scoreStableEvalResults(suite.map(row => ({
    id: row.id,
    score: row.domain === 'memory' ? 0.65 : 1,
    latency_ms: 100,
  })), suite);

  const comparison = compareStableEvalRuns(baseline, candidate, {
    maxOverallDrop: 0.1,
    maxDomainDrop: 0.05,
    minimumDomainScore: 0.7,
  });

  assert.equal(comparison.promotable, false);
  assert.ok(comparison.reasons.includes('memory:DOMAIN_REGRESSION'));
  assert.ok(comparison.reasons.includes('memory:DOMAIN_BELOW_FLOOR'));
  assert.ok(comparison.reasons.includes('memory:CRITICAL_CASE_FAILURE'));
});

test('incomplete evaluation cannot pass promotion gate', () => {
  const suite = stableEvalSuite();
  const full = scoreStableEvalResults(suite.map(row => ({ id: row.id, score: 1 })), suite);
  const partial = scoreStableEvalResults(suite.slice(0, 6).map(row => ({ id: row.id, score: 1 })), suite);

  const comparison = compareStableEvalRuns(full, partial);
  assert.equal(partial.complete, false);
  assert.equal(comparison.promotable, false);
  assert.ok(comparison.reasons.includes('INCOMPLETE_EVALUATION'));
});

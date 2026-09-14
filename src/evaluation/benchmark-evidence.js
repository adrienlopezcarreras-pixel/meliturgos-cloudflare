import { benchmarkSuiteFingerprint, CANONICAL_LEARNING_BENCHMARK_SUITE, compareBenchmarkScores } from './benchmarks.js';

function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeArtifacts(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(v => String(v || '').trim()).filter(Boolean))].slice(0, 50);
}

function domainRegressions(comparison) {
  return Object.entries(comparison?.domains || {})
    .filter(([, value]) => Number.isFinite(value?.delta) && value.delta < 0)
    .map(([domain, value]) => ({ domain, delta: value.delta }));
}

/**
 * Build auditable evidence for the ONE canonical learning benchmark suite.
 * This does not define cases or scoring; it only binds two already-scored runs
 * to durable provenance and derives whether the comparison is XP-eligible.
 */
export function buildBenchmarkComparisonEvidence({ baseline = {}, candidate = {}, source_sha = null, artifacts = [], now = () => new Date() } = {}) {
  const comparison = compareBenchmarkScores(baseline, candidate);
  const suiteDigest = benchmarkSuiteFingerprint(CANONICAL_LEARNING_BENCHMARK_SUITE);
  const baselineDigest = String(baseline?.suite_digest || suiteDigest);
  const candidateDigest = String(candidate?.suite_digest || suiteDigest);
  if (baselineDigest !== suiteDigest || candidateDigest !== suiteDigest) {
    throw Object.assign(new Error('BENCHMARK_SUITE_DIGEST_MISMATCH'), { code: 'BENCHMARK_SUITE_DIGEST_MISMATCH' });
  }

  const regressions = domainRegressions(comparison);
  const repeatedErrors = Array.isArray(candidate?.repeated_errors) ? candidate.repeated_errors.filter(Boolean) : [];
  const proofs = normalizeArtifacts(artifacts);
  const delta = finiteOrNull(comparison.delta);
  const xpEligible = delta != null && delta > 0 && regressions.length === 0 && repeatedErrors.length === 0 && proofs.length > 0;

  return {
    schema: 'mel.canonical-benchmark-comparison',
    version: 1,
    recorded_at: now().toISOString(),
    source_sha: source_sha ? String(source_sha) : null,
    suite_id: 'mel-learning-canonical-v1',
    suite_digest: suiteDigest,
    baseline: { overall: finiteOrNull(baseline?.overall), cases: Number(baseline?.cases || 0), domains: baseline?.domains || {} },
    candidate: { overall: finiteOrNull(candidate?.overall), cases: Number(candidate?.cases || 0), domains: candidate?.domains || {} },
    comparison,
    domain_regressions: regressions,
    repeated_errors: repeatedErrors,
    artifacts: proofs,
    xp_eligible: xpEligible,
  };
}

export async function persistBenchmarkComparisonEvidence({ memory, ...input } = {}) {
  if (!memory || typeof memory.remember !== 'function') {
    throw Object.assign(new Error('LEARNING_MEMORY_REQUIRED'), { code: 'LEARNING_MEMORY_REQUIRED' });
  }
  const evidence = buildBenchmarkComparisonEvidence(input);
  await memory.remember({
    goal: 'Persist canonical benchmark baseline/candidate comparison',
    kind: 'LEARNING_BENCHMARK_COMPARISON',
    lesson: evidence.xp_eligible
      ? `Canonical benchmark improved ${evidence.comparison.baseline} -> ${evidence.comparison.candidate} without domain regression.`
      : 'Canonical benchmark comparison persisted without an XP-eligible verified gain.',
    evidence,
    outcome: evidence.xp_eligible ? 'IMPROVED' : 'NO_VERIFIED_GAIN',
    score: evidence.xp_eligible ? evidence.comparison.delta : 0,
    tags: ['learning', 'benchmark', 'canonical', evidence.xp_eligible ? 'verified-gain' : 'no-gain'],
  });
  return evidence;
}

import { port } from '../core/contracts.js';
import {
  REQUIRED_LEARNING_BENCHMARK_DOMAINS,
  compareBenchmarkScores,
} from './benchmarks.js';

export const methods = ['run'];
export const REGRESSION_GATE_SCHEMA = 'mel.evaluation.regression-gate.v1';

export const DEFAULT_REGRESSION_POLICY = Object.freeze({
  max_overall_drop: 0.02,
  max_domain_drop: 0.05,
  block_repeated_errors: true,
  require_evidence: true,
  require_source_sha: true,
});

function gateError(code, details = {}) {
  return Object.assign(new Error(code), { code, ...details });
}

function scoreOrNull(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return n;
}

function positiveCaseCount(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function threshold(value, fallback, code) {
  if (value == null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) throw gateError(code, { value });
  return n;
}

function booleanOption(value, fallback, code) {
  if (value == null) return fallback;
  if (typeof value !== 'boolean') throw gateError(code, { value });
  return value;
}

function normalizeRequiredDomains(value) {
  const source = value == null ? REQUIRED_LEARNING_BENCHMARK_DOMAINS : value;
  if (!Array.isArray(source) || !source.length) throw gateError('REGRESSION_REQUIRED_DOMAINS_INVALID');
  const domains = [...new Set(source.map((domain) => String(domain || '').trim()).filter(Boolean))];
  if (!domains.length) throw gateError('REGRESSION_REQUIRED_DOMAINS_INVALID');
  return domains;
}

function normalizeDomainThresholds(value = {}) {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw gateError('REGRESSION_DOMAIN_THRESHOLDS_INVALID');
  }
  const normalized = {};
  for (const [domain, raw] of Object.entries(value)) {
    const key = String(domain || '').trim();
    if (!key) throw gateError('REGRESSION_DOMAIN_THRESHOLD_NAME_INVALID');
    normalized[key] = threshold(raw, 0, 'REGRESSION_DOMAIN_THRESHOLD_INVALID');
  }
  return normalized;
}

export function normalizeRegressionPolicy(policy = {}) {
  if (policy == null) policy = {};
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw gateError('REGRESSION_POLICY_INVALID');
  }
  return {
    max_overall_drop: threshold(
      policy.max_overall_drop ?? policy.maxOverallDrop,
      DEFAULT_REGRESSION_POLICY.max_overall_drop,
      'REGRESSION_OVERALL_THRESHOLD_INVALID',
    ),
    max_domain_drop: threshold(
      policy.max_domain_drop ?? policy.maxDomainDrop,
      DEFAULT_REGRESSION_POLICY.max_domain_drop,
      'REGRESSION_DOMAIN_THRESHOLD_INVALID',
    ),
    domain_max_drop: normalizeDomainThresholds(policy.domain_max_drop ?? policy.domainMaxDrop),
    block_repeated_errors: booleanOption(
      policy.block_repeated_errors ?? policy.blockRepeatedErrors,
      DEFAULT_REGRESSION_POLICY.block_repeated_errors,
      'REGRESSION_BLOCK_REPEATED_ERRORS_INVALID',
    ),
    require_evidence: booleanOption(
      policy.require_evidence ?? policy.requireEvidence,
      DEFAULT_REGRESSION_POLICY.require_evidence,
      'REGRESSION_REQUIRE_EVIDENCE_INVALID',
    ),
    require_source_sha: booleanOption(
      policy.require_source_sha ?? policy.requireSourceSha,
      DEFAULT_REGRESSION_POLICY.require_source_sha,
      'REGRESSION_REQUIRE_SOURCE_SHA_INVALID',
    ),
    required_domains: normalizeRequiredDomains(policy.required_domains ?? policy.requiredDomains),
  };
}

function normalizeArtifacts(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))]
    .slice(0, 50);
}

function suiteMeta(run = {}) {
  return {
    id: String(run?.suite_id || '').trim(),
    digest: String(run?.suite_digest || '').trim(),
    cases: positiveCaseCount(run?.cases),
    overall: scoreOrNull(run?.overall),
  };
}

function domainScore(run, domain) {
  const raw = run?.domains?.[domain];
  return scoreOrNull(raw && typeof raw === 'object' ? raw.score : raw);
}

function pushBlocker(blockers, code, details = {}) {
  blockers.push({ code, ...details });
}

/**
 * Fail-closed before/after quality gate for MEL evolutions.
 *
 * It consumes already-scored benchmark runs and has no storage/network side
 * effects. A caller may only promote/apply an evolution when `allowed === true`.
 */
export function evaluateRegressionGate({
  baseline = {},
  candidate = {},
  policy = {},
  source_sha = null,
  artifacts = [],
  now = () => new Date(),
} = {}) {
  const normalizedPolicy = normalizeRegressionPolicy(policy);
  const baselineMeta = suiteMeta(baseline);
  const candidateMeta = suiteMeta(candidate);
  const proofs = normalizeArtifacts(artifacts);
  const sha = String(source_sha || '').trim() || null;
  const blockers = [];

  if (!baselineMeta.id || !candidateMeta.id) {
    pushBlocker(blockers, 'BENCHMARK_SUITE_ID_REQUIRED');
  } else if (baselineMeta.id !== candidateMeta.id) {
    pushBlocker(blockers, 'BENCHMARK_SUITE_ID_MISMATCH', { baseline: baselineMeta.id, candidate: candidateMeta.id });
  }

  if (!baselineMeta.digest || !candidateMeta.digest) {
    pushBlocker(blockers, 'BENCHMARK_SUITE_DIGEST_REQUIRED');
  } else if (baselineMeta.digest !== candidateMeta.digest) {
    pushBlocker(blockers, 'BENCHMARK_SUITE_DIGEST_MISMATCH', { baseline: baselineMeta.digest, candidate: candidateMeta.digest });
  }

  if (baselineMeta.cases == null || candidateMeta.cases == null) {
    pushBlocker(blockers, 'BENCHMARK_CASE_COUNT_REQUIRED');
  } else if (candidateMeta.cases !== baselineMeta.cases) {
    pushBlocker(blockers, 'BENCHMARK_CASE_COUNT_MISMATCH', { baseline: baselineMeta.cases, candidate: candidateMeta.cases });
  }

  if (baselineMeta.overall == null || candidateMeta.overall == null) {
    pushBlocker(blockers, 'BENCHMARK_OVERALL_SCORE_REQUIRED');
  }

  for (const domain of normalizedPolicy.required_domains) {
    const before = domainScore(baseline, domain);
    const after = domainScore(candidate, domain);
    if (before == null) pushBlocker(blockers, 'BASELINE_DOMAIN_SCORE_REQUIRED', { domain });
    if (after == null) pushBlocker(blockers, 'CANDIDATE_DOMAIN_SCORE_REQUIRED', { domain });
  }

  const comparison = compareBenchmarkScores(baseline, candidate);
  if (Number.isFinite(comparison.delta) && comparison.delta < -normalizedPolicy.max_overall_drop) {
    pushBlocker(blockers, 'OVERALL_REGRESSION', {
      delta: comparison.delta,
      max_drop: normalizedPolicy.max_overall_drop,
    });
  }

  for (const domain of normalizedPolicy.required_domains) {
    const delta = comparison?.domains?.[domain]?.delta;
    if (!Number.isFinite(delta)) continue;
    const maxDrop = normalizedPolicy.domain_max_drop[domain] ?? normalizedPolicy.max_domain_drop;
    if (delta < -maxDrop) {
      pushBlocker(blockers, 'DOMAIN_REGRESSION', { domain, delta, max_drop: maxDrop });
    }
  }

  const repeatedErrors = [...new Set((Array.isArray(candidate?.repeated_errors) ? candidate.repeated_errors : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
  if (normalizedPolicy.block_repeated_errors && repeatedErrors.length) {
    pushBlocker(blockers, 'REPEATED_VERIFIED_ERROR', { case_ids: repeatedErrors });
  }

  if (normalizedPolicy.require_source_sha && !sha) pushBlocker(blockers, 'SOURCE_SHA_REQUIRED');
  if (normalizedPolicy.require_evidence && !proofs.length) pushBlocker(blockers, 'REGRESSION_EVIDENCE_REQUIRED');

  const evaluatedAt = now();
  if (!(evaluatedAt instanceof Date) || Number.isNaN(evaluatedAt.getTime())) {
    throw gateError('REGRESSION_GATE_TIME_INVALID');
  }

  const allowed = blockers.length === 0;
  return {
    schema: REGRESSION_GATE_SCHEMA,
    version: 1,
    evaluated_at: evaluatedAt.toISOString(),
    allowed,
    decision: allowed ? 'ALLOW' : 'BLOCK',
    source_sha: sha,
    suite: {
      baseline: baselineMeta,
      candidate: candidateMeta,
    },
    policy: normalizedPolicy,
    comparison,
    repeated_errors: repeatedErrors,
    artifacts: proofs,
    blockers,
  };
}

export function assertRegressionGate(input = {}) {
  const gate = evaluateRegressionGate(input);
  if (!gate.allowed) {
    throw gateError('REGRESSION_GATE_BLOCKED', {
      blockers: gate.blockers,
      gate,
    });
  }
  return gate;
}

/**
 * Adapter-backed runtime port remains available for persisted/integrated runs.
 * The pure gate above is intentionally dependency-light so CI and evolution
 * pipelines can apply it before any promotion or irreversible action.
 */
export const createRegression = adapters => port('evaluation/regression', methods, adapters);

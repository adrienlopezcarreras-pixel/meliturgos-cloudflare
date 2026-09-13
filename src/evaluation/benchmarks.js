import { port } from '../core/contracts.js';

export const methods = ['run', 'compare'];

export const REQUIRED_LEARNING_BENCHMARK_DOMAINS = Object.freeze([
  'memory_provenance',
  'instruction_following',
  'taught_error_correction',
  'code_development',
  'tool_model_selection',
  'multi_step_autonomy',
  'non_regression',
]);

export const CANONICAL_LEARNING_BENCHMARK_SUITE = Object.freeze([
  Object.freeze({ id: 'memory-provenance-01', domain: 'memory_provenance', weight: 1, objective: 'Retrieve a relevant remembered fact while preserving provenance and uncertainty.' }),
  Object.freeze({ id: 'instruction-following-01', domain: 'instruction_following', weight: 1, objective: 'Follow explicit constraints without adding forbidden actions or unsupported claims.' }),
  Object.freeze({ id: 'taught-error-correction-01', domain: 'taught_error_correction', weight: 1.2, objective: 'Avoid repeating an error for which a validated correction lesson exists.' }),
  Object.freeze({ id: 'code-development-01', domain: 'code_development', weight: 1.2, objective: 'Produce a minimal reversible code change with targeted tests and evidence.' }),
  Object.freeze({ id: 'tool-model-selection-01', domain: 'tool_model_selection', weight: 1, objective: 'Select an available zero-cost tool/model appropriate for the task and fail closed on unknown cost.' }),
  Object.freeze({ id: 'multi-step-autonomy-01', domain: 'multi_step_autonomy', weight: 1.2, objective: 'Resume a multi-step task from checkpoint and advance it without duplicating completed work.' }),
  Object.freeze({ id: 'non-regression-01', domain: 'non_regression', weight: 1.2, objective: 'Preserve previously verified behavior while applying a new correction or capability change.' }),
]);

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function stableDigest(value) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function benchmarkSuiteFingerprint(suite = CANONICAL_LEARNING_BENCHMARK_SUITE) {
  const rows = (Array.isArray(suite) ? suite : []).map((row) => ({
    id: String(row?.id || ''),
    domain: String(row?.domain || ''),
    weight: Number(row?.weight || 1),
    objective: String(row?.objective || ''),
  }));
  return stableDigest(rows);
}

export function validateLearningBenchmarkSuite(suite = CANONICAL_LEARNING_BENCHMARK_SUITE) {
  if (!Array.isArray(suite) || !suite.length) {
    throw Object.assign(new Error('BENCHMARK_SUITE_EMPTY'), { code: 'BENCHMARK_SUITE_EMPTY' });
  }
  const ids = new Set();
  const domains = new Set();
  for (const row of suite) {
    const id = String(row?.id || '').trim();
    const domain = String(row?.domain || '').trim();
    if (!id || !domain || !String(row?.objective || '').trim()) {
      throw Object.assign(new Error('BENCHMARK_CASE_INVALID'), { code: 'BENCHMARK_CASE_INVALID' });
    }
    if (ids.has(id)) throw Object.assign(new Error('BENCHMARK_CASE_DUPLICATE'), { code: 'BENCHMARK_CASE_DUPLICATE', id });
    ids.add(id);
    domains.add(domain);
  }
  const missing = REQUIRED_LEARNING_BENCHMARK_DOMAINS.filter((domain) => !domains.has(domain));
  if (missing.length) {
    throw Object.assign(new Error(`BENCHMARK_DOMAINS_MISSING:${missing.join(',')}`), { code: 'BENCHMARK_DOMAINS_MISSING', missing });
  }
  return { cases: suite.length, domains: [...domains], digest: benchmarkSuiteFingerprint(suite) };
}

/**
 * Deterministic scorer for MEL benchmark results.
 * Each case: { id, domain, score: 0..1, weight?: number }.
 */
export function scoreBenchmarkResults(cases = []) {
  const rows = Array.isArray(cases) ? cases.filter(Boolean) : [];
  const byDomain = new Map();
  let weighted = 0;
  let totalWeight = 0;

  for (const row of rows) {
    const domain = String(row.domain || 'general');
    const score = clamp01(row.score);
    const weight = Math.max(0.0001, Number(row.weight) || 1);
    weighted += score * weight;
    totalWeight += weight;

    const current = byDomain.get(domain) || { weighted: 0, weight: 0, cases: 0 };
    current.weighted += score * weight;
    current.weight += weight;
    current.cases += 1;
    byDomain.set(domain, current);
  }

  const domains = {};
  for (const [domain, value] of byDomain.entries()) {
    domains[domain] = {
      score: value.weight ? value.weighted / value.weight : 0,
      cases: value.cases,
    };
  }

  return {
    overall: totalWeight ? weighted / totalWeight : 0,
    cases: rows.length,
    domains,
  };
}

export async function runLearningBenchmarkSuite({ suite = CANONICAL_LEARNING_BENCHMARK_SUITE, evaluator } = {}) {
  const validated = validateLearningBenchmarkSuite(suite);
  if (typeof evaluator !== 'function') {
    throw Object.assign(new Error('BENCHMARK_EVALUATOR_REQUIRED'), { code: 'BENCHMARK_EVALUATOR_REQUIRED' });
  }
  const results = [];
  for (const testCase of suite) {
    const observation = await evaluator(structuredClone(testCase));
    const rawScore = typeof observation === 'number' ? observation : observation?.score;
    if (!Number.isFinite(Number(rawScore))) {
      throw Object.assign(new Error(`BENCHMARK_SCORE_REQUIRED:${testCase.id}`), { code: 'BENCHMARK_SCORE_REQUIRED', case_id: testCase.id });
    }
    results.push({
      id: testCase.id,
      domain: testCase.domain,
      weight: Number(testCase.weight || 1),
      score: clamp01(rawScore),
      repeated_error: observation?.repeated_error === true,
      evidence: observation && typeof observation === 'object' ? (observation.evidence ?? null) : null,
    });
  }
  const score = scoreBenchmarkResults(results);
  return {
    suite_id: 'mel-learning-canonical-v1',
    suite_digest: validated.digest,
    required_domains: [...REQUIRED_LEARNING_BENCHMARK_DOMAINS],
    repeated_errors: results.filter((row) => row.repeated_error).map((row) => row.id),
    results,
    ...score,
  };
}

export function compareBenchmarkScores(baseline, candidate) {
  const baseOverall = Number(baseline?.overall);
  const candOverall = Number(candidate?.overall);
  const domains = {};
  const names = new Set([
    ...Object.keys(baseline?.domains || {}),
    ...Object.keys(candidate?.domains || {}),
  ]);

  for (const domain of names) {
    const before = Number(baseline?.domains?.[domain]?.score ?? baseline?.domains?.[domain]);
    const after = Number(candidate?.domains?.[domain]?.score ?? candidate?.domains?.[domain]);
    domains[domain] = {
      baseline: Number.isFinite(before) ? before : null,
      candidate: Number.isFinite(after) ? after : null,
      delta: Number.isFinite(before) && Number.isFinite(after) ? after - before : null,
    };
  }

  return {
    baseline: Number.isFinite(baseOverall) ? baseOverall : null,
    candidate: Number.isFinite(candOverall) ? candOverall : null,
    delta: Number.isFinite(baseOverall) && Number.isFinite(candOverall) ? candOverall - baseOverall : null,
    domains,
  };
}

/**
 * Adapter-backed runtime port remains available for persisted benchmark runs.
 * The pure scorer/comparator above allow deterministic local and CI evaluation.
 */
export const createBenchmarks = adapters => port('evaluation/benchmarks', methods, adapters);

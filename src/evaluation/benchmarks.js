import { port } from '../core/contracts.js';

export const methods = ['run', 'compare'];

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
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

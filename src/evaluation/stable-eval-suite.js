export const MEL_STABLE_EVAL_SUITE_ID = 'mel-core-stable-eval-v1';
export const MEL_STABLE_EVAL_SUITE_VERSION = 1;

export const MEL_STABLE_EVAL_DOMAINS = Object.freeze([
  'conversation',
  'code',
  'search',
  'memory',
]);

const SUITE = Object.freeze([
  Object.freeze({
    id: 'conversation-follow-constraints',
    domain: 'conversation',
    weight: 1.2,
    critical: true,
    objective: 'Respect explicit response constraints while remaining relevant and concise.',
  }),
  Object.freeze({
    id: 'conversation-context-continuity',
    domain: 'conversation',
    weight: 1,
    critical: true,
    objective: 'Use the current conversational anchor without inventing prior context.',
  }),
  Object.freeze({
    id: 'code-minimal-change',
    domain: 'code',
    weight: 1.2,
    critical: true,
    objective: 'Prefer the smallest reversible implementation that satisfies the stated requirement.',
  }),
  Object.freeze({
    id: 'code-non-regression',
    domain: 'code',
    weight: 1.4,
    critical: true,
    objective: 'Preserve previously verified behavior and require targeted plus full-suite evidence.',
  }),
  Object.freeze({
    id: 'search-grounded-answer',
    domain: 'search',
    weight: 1.2,
    critical: true,
    objective: 'Answer from retrieved evidence and keep unsupported claims out of the result.',
  }),
  Object.freeze({
    id: 'search-source-quality',
    domain: 'search',
    weight: 1,
    critical: false,
    objective: 'Prefer authoritative, recent and directly relevant sources over weak secondary evidence.',
  }),
  Object.freeze({
    id: 'memory-provenance',
    domain: 'memory',
    weight: 1.4,
    critical: true,
    objective: 'Recall the relevant memory while preserving provenance, temporal context and uncertainty.',
  }),
  Object.freeze({
    id: 'memory-contradiction',
    domain: 'memory',
    weight: 1.1,
    critical: true,
    objective: 'Keep conflicting memories distinct and avoid silently upgrading uncertain facts.',
  }),
]);

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child !== undefined) out[key] = canonical(child);
  }
  return out;
}

export function stableEvalSuite() {
  return SUITE.map(row => structuredClone(row));
}

export function stableEvalSuiteFingerprint(suite = SUITE) {
  const text = JSON.stringify(canonical((Array.isArray(suite) ? suite : []).map(row => ({
    id: String(row?.id || ''),
    domain: String(row?.domain || ''),
    weight: Number(row?.weight || 1),
    critical: row?.critical === true,
    objective: String(row?.objective || ''),
  }))));
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function validateStableEvalSuite(suite = SUITE) {
  if (!Array.isArray(suite) || suite.length === 0) {
    throw Object.assign(new Error('STABLE_EVAL_SUITE_EMPTY'), { code: 'STABLE_EVAL_SUITE_EMPTY' });
  }
  const ids = new Set();
  const domains = new Set();
  for (const row of suite) {
    const id = String(row?.id || '').trim();
    const domain = String(row?.domain || '').trim();
    const objective = String(row?.objective || '').trim();
    const weight = Number(row?.weight || 0);
    if (!id || !domain || !objective || !Number.isFinite(weight) || weight <= 0) {
      throw Object.assign(new Error('STABLE_EVAL_CASE_INVALID'), { code: 'STABLE_EVAL_CASE_INVALID' });
    }
    if (ids.has(id)) {
      throw Object.assign(new Error('STABLE_EVAL_CASE_DUPLICATE'), { code: 'STABLE_EVAL_CASE_DUPLICATE', id });
    }
    ids.add(id);
    domains.add(domain);
  }
  const missingDomains = MEL_STABLE_EVAL_DOMAINS.filter(domain => !domains.has(domain));
  if (missingDomains.length) {
    throw Object.assign(new Error('STABLE_EVAL_DOMAINS_MISSING'), {
      code: 'STABLE_EVAL_DOMAINS_MISSING',
      missing: missingDomains,
    });
  }
  return Object.freeze({
    suite_id: MEL_STABLE_EVAL_SUITE_ID,
    version: MEL_STABLE_EVAL_SUITE_VERSION,
    cases: suite.length,
    domains: [...domains],
    fingerprint: stableEvalSuiteFingerprint(suite),
  });
}

export function scoreStableEvalResults(results = [], suite = SUITE) {
  const suiteById = new Map((Array.isArray(suite) ? suite : []).map(row => [String(row.id), row]));
  const rows = [];
  for (const result of Array.isArray(results) ? results : []) {
    const definition = suiteById.get(String(result?.id || ''));
    if (!definition) continue;
    rows.push({
      id: definition.id,
      domain: definition.domain,
      critical: definition.critical === true,
      weight: Number(definition.weight || 1),
      score: clamp01(result?.score),
      latency_ms: Math.max(0, Number(result?.latency_ms) || 0),
      evidence: result?.evidence ?? null,
      error: result?.error ? String(result.error).slice(0, 300) : null,
    });
  }

  const byDomain = new Map();
  let weighted = 0;
  let totalWeight = 0;
  for (const row of rows) {
    weighted += row.score * row.weight;
    totalWeight += row.weight;
    const current = byDomain.get(row.domain) || {
      weighted: 0,
      weight: 0,
      cases: 0,
      critical_failures: 0,
      latency_total: 0,
    };
    current.weighted += row.score * row.weight;
    current.weight += row.weight;
    current.cases += 1;
    current.latency_total += row.latency_ms;
    if (row.critical && row.score < 0.7) current.critical_failures += 1;
    byDomain.set(row.domain, current);
  }

  const domains = {};
  for (const domain of MEL_STABLE_EVAL_DOMAINS) {
    const value = byDomain.get(domain);
    domains[domain] = value
      ? {
          score: value.weight ? value.weighted / value.weight : 0,
          cases: value.cases,
          critical_failures: value.critical_failures,
          avg_latency_ms: value.cases ? value.latency_total / value.cases : 0,
        }
      : {
          score: 0,
          cases: 0,
          critical_failures: 0,
          avg_latency_ms: 0,
        };
  }

  const expected = Array.isArray(suite) ? suite.length : 0;
  return Object.freeze({
    suite_id: MEL_STABLE_EVAL_SUITE_ID,
    version: MEL_STABLE_EVAL_SUITE_VERSION,
    fingerprint: stableEvalSuiteFingerprint(suite),
    overall: totalWeight ? weighted / totalWeight : 0,
    case_count: rows.length,
    expected_case_count: expected,
    complete: expected > 0 && rows.length === expected,
    domains,
    results: rows,
  });
}

export async function runStableEvalSuite({
  suite = SUITE,
  evaluators = {},
  metadata = {},
} = {}) {
  const validated = validateStableEvalSuite(suite);
  const results = [];
  for (const testCase of suite) {
    const evaluator = evaluators?.[testCase.domain];
    const started = Date.now();
    if (typeof evaluator !== 'function') {
      results.push({
        id: testCase.id,
        score: 0,
        latency_ms: 0,
        error: `EVALUATOR_MISSING:${testCase.domain}`,
        evidence: null,
      });
      continue;
    }
    try {
      const observation = await evaluator(structuredClone(testCase));
      const rawScore = typeof observation === 'number' ? observation : observation?.score;
      if (!Number.isFinite(Number(rawScore))) {
        throw Object.assign(new Error('STABLE_EVAL_SCORE_REQUIRED'), {
          code: 'STABLE_EVAL_SCORE_REQUIRED',
          case_id: testCase.id,
        });
      }
      results.push({
        id: testCase.id,
        score: clamp01(rawScore),
        latency_ms: Math.max(0, Date.now() - started),
        evidence: observation && typeof observation === 'object' ? (observation.evidence ?? null) : null,
        error: null,
      });
    } catch (error) {
      results.push({
        id: testCase.id,
        score: 0,
        latency_ms: Math.max(0, Date.now() - started),
        evidence: null,
        error: String(error?.code || error?.message || 'STABLE_EVAL_CASE_FAILED').slice(0, 300),
      });
    }
  }

  return Object.freeze({
    ...scoreStableEvalResults(results, suite),
    metadata: canonical(metadata),
    validation: validated,
    completed_at: Date.now(),
  });
}

export function compareStableEvalRuns(baseline = {}, candidate = {}, {
  maxOverallDrop = 0.02,
  maxDomainDrop = 0.05,
  minimumDomainScore = 0.7,
  requireComplete = true,
} = {}) {
  const domainComparison = {};
  let regression = false;
  const reasons = [];

  if (requireComplete && (baseline?.complete !== true || candidate?.complete !== true)) {
    regression = true;
    reasons.push('INCOMPLETE_EVALUATION');
  }

  const baselineOverall = Number(baseline?.overall);
  const candidateOverall = Number(candidate?.overall);
  const overallDelta = Number.isFinite(baselineOverall) && Number.isFinite(candidateOverall)
    ? candidateOverall - baselineOverall
    : null;
  if (overallDelta == null) {
    regression = true;
    reasons.push('OVERALL_SCORE_MISSING');
  } else if (overallDelta < -Math.abs(Number(maxOverallDrop) || 0)) {
    regression = true;
    reasons.push('OVERALL_REGRESSION');
  }

  for (const domain of MEL_STABLE_EVAL_DOMAINS) {
    const before = Number(baseline?.domains?.[domain]?.score);
    const after = Number(candidate?.domains?.[domain]?.score);
    const delta = Number.isFinite(before) && Number.isFinite(after) ? after - before : null;
    const criticalFailures = Number(candidate?.domains?.[domain]?.critical_failures || 0);
    const domainReasons = [];
    if (delta == null) domainReasons.push('DOMAIN_SCORE_MISSING');
    if (delta != null && delta < -Math.abs(Number(maxDomainDrop) || 0)) domainReasons.push('DOMAIN_REGRESSION');
    if (Number.isFinite(after) && after < Number(minimumDomainScore)) domainReasons.push('DOMAIN_BELOW_FLOOR');
    if (criticalFailures > 0) domainReasons.push('CRITICAL_CASE_FAILURE');
    if (domainReasons.length) {
      regression = true;
      reasons.push(...domainReasons.map(reason => `${domain}:${reason}`));
    }
    domainComparison[domain] = {
      baseline: Number.isFinite(before) ? before : null,
      candidate: Number.isFinite(after) ? after : null,
      delta,
      critical_failures: criticalFailures,
      reasons: domainReasons,
    };
  }

  return Object.freeze({
    promotable: !regression,
    regression,
    baseline_overall: Number.isFinite(baselineOverall) ? baselineOverall : null,
    candidate_overall: Number.isFinite(candidateOverall) ? candidateOverall : null,
    overall_delta: overallDelta,
    thresholds: {
      max_overall_drop: Math.abs(Number(maxOverallDrop) || 0),
      max_domain_drop: Math.abs(Number(maxDomainDrop) || 0),
      minimum_domain_score: Number(minimumDomainScore),
      require_complete: requireComplete === true,
    },
    domains: domainComparison,
    reasons: [...new Set(reasons)],
  });
}

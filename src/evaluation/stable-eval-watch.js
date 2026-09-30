import {
  compareStableEvalRuns,
  runStableEvalSuite,
  stableEvalSuiteFingerprint,
} from './stable-eval-suite.js';

export const STABLE_EVAL_WATCH_SCHEMA = 'mel.stable-eval-watch.v1';

function evalError(code, status = 400, details = {}) {
  return Object.assign(new Error(code), { code, status, ...details });
}

function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sourceSha(value) {
  const sha = String(value || '').trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw evalError('STABLE_EVAL_SOURCE_SHA_INVALID');
  return sha;
}

function normalizeState(value = {}) {
  if (!record(value) || Object.keys(value).length === 0) {
    return {
      schema: STABLE_EVAL_WATCH_SCHEMA,
      revision: 0,
      baseline: null,
      last_candidate: null,
      last_comparison: null,
    };
  }
  if (value.schema !== STABLE_EVAL_WATCH_SCHEMA) throw evalError('STABLE_EVAL_WATCH_STATE_INVALID', 500);
  const revision = Number(value.revision);
  if (!Number.isInteger(revision) || revision < 0) throw evalError('STABLE_EVAL_WATCH_REVISION_INVALID', 500);
  return {
    schema: STABLE_EVAL_WATCH_SCHEMA,
    revision,
    baseline: value.baseline && record(value.baseline) ? structuredClone(value.baseline) : null,
    last_candidate: value.last_candidate && record(value.last_candidate) ? structuredClone(value.last_candidate) : null,
    last_comparison: value.last_comparison && record(value.last_comparison) ? structuredClone(value.last_comparison) : null,
  };
}

function ensureRun(run, sha) {
  if (!record(run) || run.complete !== true) throw evalError('STABLE_EVAL_RUN_INCOMPLETE', 409);
  if (run.fingerprint !== stableEvalSuiteFingerprint()) {
    throw evalError('STABLE_EVAL_SUITE_FINGERPRINT_MISMATCH', 409);
  }
  const metadataSha = String(run?.metadata?.source_sha || '').trim().toLowerCase();
  if (metadataSha !== sha) throw evalError('STABLE_EVAL_RUN_SOURCE_SHA_MISMATCH', 409);
  return run;
}

function snapshotRun(run, sha) {
  return structuredClone({
    source_sha: sha,
    suite_id: run.suite_id,
    version: run.version,
    fingerprint: run.fingerprint,
    overall: run.overall,
    case_count: run.case_count,
    expected_case_count: run.expected_case_count,
    complete: run.complete,
    domains: run.domains,
    results: run.results,
    metadata: run.metadata,
    completed_at: run.completed_at,
  });
}

/**
 * Durable stable-evaluation watch.
 *
 * The first complete exact-SHA run establishes a baseline. Later candidates
 * are compared against that baseline and replace it only when the canonical
 * non-regression gate is promotable. Rejected candidates remain observable but
 * can never silently become the new baseline.
 */
export async function runStableEvalWatch({
  store,
  evaluators,
  source_sha,
  metadata = {},
  policy = {},
} = {}) {
  if (!store || typeof store.load !== 'function' || typeof store.save !== 'function') {
    throw evalError('STABLE_EVAL_WATCH_STORE_REQUIRED', 500);
  }
  const sha = sourceSha(source_sha);
  const previous = normalizeState(await store.load());
  const run = ensureRun(await runStableEvalSuite({
    evaluators,
    metadata: { ...metadata, source_sha: sha },
  }), sha);
  const candidate = snapshotRun(run, sha);

  if (!previous.baseline) {
    const next = {
      schema: STABLE_EVAL_WATCH_SCHEMA,
      revision: previous.revision + 1,
      baseline: candidate,
      last_candidate: candidate,
      last_comparison: {
        promotable: true,
        regression: false,
        reasons: ['BASELINE_ESTABLISHED'],
      },
    };
    await store.save(structuredClone(next));
    return Object.freeze({
      ok: true,
      status: 'BASELINE_ESTABLISHED',
      promoted: true,
      source_sha: sha,
      baseline_source_sha: sha,
      run: candidate,
      comparison: next.last_comparison,
      state: structuredClone(next),
    });
  }

  const baseline = previous.baseline;
  if (baseline.fingerprint !== candidate.fingerprint) {
    throw evalError('STABLE_EVAL_BASELINE_FINGERPRINT_MISMATCH', 409);
  }

  const comparison = compareStableEvalRuns(baseline, candidate, policy);
  const promoted = comparison.promotable === true;
  const next = {
    schema: STABLE_EVAL_WATCH_SCHEMA,
    revision: previous.revision + 1,
    baseline: promoted ? candidate : structuredClone(baseline),
    last_candidate: candidate,
    last_comparison: structuredClone(comparison),
  };
  await store.save(structuredClone(next));

  return Object.freeze({
    ok: true,
    status: promoted ? 'PROMOTED' : 'REGRESSION_BLOCKED',
    promoted,
    source_sha: sha,
    baseline_source_sha: next.baseline.source_sha,
    run: candidate,
    comparison: structuredClone(comparison),
    state: structuredClone(next),
  });
}

export function createInMemoryStableEvalWatchStore(initial = {}) {
  let state = structuredClone(initial);
  return Object.freeze({
    async load() {
      return structuredClone(state);
    },
    async save(value) {
      state = structuredClone(value);
    },
  });
}

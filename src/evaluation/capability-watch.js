export const CAPABILITY_WATCH_SCHEMA = 'mel.capability-watch.v2';
export const DEFAULT_CAPABILITY_WATCH_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const DEFAULT_CAPABILITY_WATCH_REGRESSION_THRESHOLD = 0.05;

export const DEFAULT_CAPABILITY_WATCH_TARGETS = Object.freeze([
  Object.freeze({ id: 'memory_provenance', weight: 1 }),
  Object.freeze({ id: 'instruction_following', weight: 1 }),
  Object.freeze({ id: 'taught_error_correction', weight: 1.2 }),
  Object.freeze({ id: 'code_development', weight: 1.2 }),
  Object.freeze({ id: 'tool_model_selection', weight: 1 }),
  Object.freeze({ id: 'multi_step_autonomy', weight: 1.2 }),
  Object.freeze({ id: 'non_regression', weight: 1.2 }),
]);

const MIN_INTERVAL_MS = 60_000;
const MAX_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

function finiteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
function clamp01(value) { return Math.max(0, Math.min(1, finiteNumber(value, 0))); }
function normalizeInterval(value) {
  return Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, Math.trunc(finiteNumber(value, DEFAULT_CAPABILITY_WATCH_INTERVAL_MS))));
}
function normalizeThreshold(value) {
  return Math.max(0, Math.min(1, finiteNumber(value, DEFAULT_CAPABILITY_WATCH_REGRESSION_THRESHOLD)));
}
function boundedText(value, max = 1200) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}
function compactEvidence(value) {
  if (value == null) return null;
  if (typeof value === 'string') return boundedText(value, 4000);
  if (typeof value !== 'object') return boundedText(value, 1000);
  const sources = Array.isArray(value.sources) ? value.sources.slice(0, 5).map(source => ({
    title: boundedText(source?.title, 240),
    url: boundedText(source?.url, 500),
  })) : [];
  return {
    summary: boundedText(value.summary, 1800),
    citations_count: Math.max(0, Math.trunc(finiteNumber(value.citations_count, sources.length))),
    sources,
    performed_at: boundedText(value.performed_at || value.retrieved_at || '', 80) || null,
    status: boundedText(value.status || '', 80) || null,
  };
}
function normalizeTarget(target = {}) {
  const id = String(target.id || '').trim();
  if (!id) throw Object.assign(new Error('CAPABILITY_WATCH_TARGET_ID_REQUIRED'), { code: 'CAPABILITY_WATCH_TARGET_ID_REQUIRED' });
  const mode = String(target.mode || 'score').trim().toLowerCase();
  if (!['score', 'observe'].includes(mode)) throw Object.assign(new Error('CAPABILITY_WATCH_TARGET_MODE_INVALID'), { code: 'CAPABILITY_WATCH_TARGET_MODE_INVALID' });
  return {
    id,
    mode,
    weight: Math.max(0.0001, finiteNumber(target.weight, 1)),
    metadata: target.metadata && typeof target.metadata === 'object' && !Array.isArray(target.metadata)
      ? structuredClone(target.metadata)
      : {},
  };
}
function normalizeTargets(targets = DEFAULT_CAPABILITY_WATCH_TARGETS) {
  if (!Array.isArray(targets) || targets.length === 0) {
    throw Object.assign(new Error('CAPABILITY_WATCH_TARGETS_REQUIRED'), { code: 'CAPABILITY_WATCH_TARGETS_REQUIRED' });
  }
  const normalized = targets.map(normalizeTarget);
  const seen = new Set();
  for (const target of normalized) {
    if (seen.has(target.id)) {
      throw Object.assign(new Error(`CAPABILITY_WATCH_TARGET_DUPLICATE:${target.id}`), {
        code: 'CAPABILITY_WATCH_TARGET_DUPLICATE',
        capability_id: target.id,
      });
    }
    seen.add(target.id);
  }
  return normalized;
}

export function normalizeCapabilityWatchState(state = {}) {
  const input = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  const scores = {};
  for (const [id, score] of Object.entries(input.last_scores || {})) {
    const numeric = Number(score);
    if (Number.isFinite(numeric)) scores[String(id)] = clamp01(numeric);
  }
  const observations = {};
  for (const [id, evidence] of Object.entries(input.last_observations || {})) {
    observations[String(id)] = compactEvidence(evidence);
  }
  return {
    schema: CAPABILITY_WATCH_SCHEMA,
    interval_ms: normalizeInterval(input.interval_ms),
    last_window_id: Number.isInteger(input.last_window_id) ? input.last_window_id : null,
    last_run_at: Number.isFinite(Number(input.last_run_at)) ? Number(input.last_run_at) : null,
    run_count: Math.max(0, Math.trunc(finiteNumber(input.run_count, 0))),
    last_scores: scores,
    last_observations: observations,
    last_source_sha: String(input.last_source_sha || '').trim() || null,
  };
}

export function capabilityWatchWindow({ now = Date.now(), intervalMs = DEFAULT_CAPABILITY_WATCH_INTERVAL_MS } = {}) {
  const measuredAt = Math.max(0, Math.trunc(finiteNumber(now, Date.now())));
  const interval = normalizeInterval(intervalMs);
  const windowId = Math.floor(measuredAt / interval);
  const windowStartedAt = windowId * interval;
  return {
    window_id: windowId,
    window_started_at: windowStartedAt,
    next_window_at: windowStartedAt + interval,
    interval_ms: interval,
  };
}

export function planCapabilityWatch({ now = Date.now(), intervalMs, state = {} } = {}) {
  const previous = normalizeCapabilityWatchState(state);
  const window = capabilityWatchWindow({ now, intervalMs: intervalMs ?? previous.interval_ms });
  const neverRan = previous.last_window_id === null;
  const due = neverRan || previous.last_window_id < window.window_id;
  return {
    due,
    reason: neverRan ? 'INITIAL' : (due ? 'INTERVAL_ELAPSED' : 'ALREADY_RAN_WINDOW'),
    previous,
    ...window,
  };
}

function scoreRun(results = []) {
  let weightedScore = 0;
  let totalWeight = 0;
  for (const result of results) {
    if (!Number.isFinite(result.score)) continue;
    weightedScore += result.score * result.weight;
    totalWeight += result.weight;
  }
  return totalWeight ? weightedScore / totalWeight : null;
}

function compareScores(previousScores = {}, results = [], threshold = DEFAULT_CAPABILITY_WATCH_REGRESSION_THRESHOLD) {
  const regressions = [];
  for (const result of results) {
    if (!Number.isFinite(result.score)) continue;
    const before = Number(previousScores[result.id]);
    if (!Number.isFinite(before)) continue;
    const delta = result.score - before;
    if (delta < -threshold) {
      regressions.push({
        id: result.id,
        previous_score: before,
        current_score: result.score,
        delta,
      });
    }
  }
  return regressions;
}

export async function runCapabilityWatch({
  now = Date.now(),
  intervalMs,
  state = {},
  evaluator = null,
  targets = DEFAULT_CAPABILITY_WATCH_TARGETS,
  regressionThreshold = DEFAULT_CAPABILITY_WATCH_REGRESSION_THRESHOLD,
  source_sha = null,
  metadata = {},
} = {}) {
  const plan = planCapabilityWatch({ now, intervalMs, state });
  const measuredAt = Math.max(0, Math.trunc(finiteNumber(now, Date.now())));

  if (!plan.due) {
    return {
      status: 'NOT_DUE', reason: plan.reason, measured_at: measuredAt,
      next_due_at: plan.next_window_at, state: plan.previous, results: [], regressions: [], overall: null,
    };
  }
  if (typeof evaluator !== 'function') {
    return {
      status: 'BLOCKED_EVALUATOR_UNAVAILABLE', reason: plan.reason, measured_at: measuredAt,
      next_due_at: plan.window_started_at, state: plan.previous, results: [], regressions: [], overall: null,
    };
  }

  const normalizedTargets = normalizeTargets(targets);
  const results = [];
  const nextObservations = { ...plan.previous.last_observations };

  for (const target of normalizedTargets) {
    let observation;
    try {
      observation = await evaluator({
        capability_id: target.id,
        mode: target.mode,
        window_id: plan.window_id,
        source_sha: source_sha || null,
        metadata: structuredClone(metadata || {}),
        target: structuredClone(target),
      });
    } catch (error) {
      return {
        status: 'FAILED', reason: 'EVALUATOR_ERROR', capability_id: target.id,
        failure: String(error?.code || error?.message || 'CAPABILITY_WATCH_EVALUATOR_FAILED').slice(0, 240),
        measured_at: measuredAt, next_due_at: plan.window_started_at, state: plan.previous,
        results, regressions: [], overall: null,
      };
    }

    if (target.mode === 'observe') {
      const evidence = compactEvidence(observation?.evidence ?? observation);
      nextObservations[target.id] = evidence;
      results.push({
        id: target.id, mode: 'observe', weight: target.weight, score: null,
        latency_ms: Math.max(0, finiteNumber(observation?.latency_ms, 0)), evidence,
      });
      continue;
    }

    const rawScore = typeof observation === 'number' ? observation : observation?.score;
    if (!Number.isFinite(Number(rawScore))) {
      return {
        status: 'FAILED', reason: 'INVALID_SCORE', capability_id: target.id,
        failure: `CAPABILITY_WATCH_SCORE_REQUIRED:${target.id}`, measured_at: measuredAt,
        next_due_at: plan.window_started_at, state: plan.previous, results, regressions: [], overall: null,
      };
    }
    results.push({
      id: target.id, mode: 'score', weight: target.weight, score: clamp01(rawScore),
      latency_ms: Math.max(0, finiteNumber(observation?.latency_ms, 0)),
      evidence: compactEvidence(observation?.evidence ?? null),
    });
  }

  const threshold = normalizeThreshold(regressionThreshold);
  const regressions = compareScores(plan.previous.last_scores, results, threshold);
  const scored = results.filter(result => Number.isFinite(result.score));
  const lastScores = {
    ...plan.previous.last_scores,
    ...Object.fromEntries(scored.map(result => [result.id, result.score])),
  };
  const nextState = {
    schema: CAPABILITY_WATCH_SCHEMA,
    interval_ms: plan.interval_ms,
    last_window_id: plan.window_id,
    last_run_at: measuredAt,
    run_count: plan.previous.run_count + 1,
    last_scores: lastScores,
    last_observations: nextObservations,
    last_source_sha: String(source_sha || '').trim() || null,
  };

  return {
    status: 'RAN', reason: plan.reason, measured_at: measuredAt, next_due_at: plan.next_window_at,
    source_sha: nextState.last_source_sha, interval_ms: plan.interval_ms,
    regression_threshold: threshold, overall: scoreRun(results), results, regressions, state: nextState,
  };
}

export async function runPersistedCapabilityWatch({ store, ...options } = {}) {
  if (!store || typeof store.load !== 'function' || typeof store.save !== 'function') {
    throw Object.assign(new Error('CAPABILITY_WATCH_STORE_REQUIRED'), { code: 'CAPABILITY_WATCH_STORE_REQUIRED' });
  }
  const state = await store.load();
  const result = await runCapabilityWatch({ ...options, state });
  if (result.status === 'RAN') await store.save(structuredClone(result.state));
  return result;
}

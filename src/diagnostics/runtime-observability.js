const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_LIMIT = 200;
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_LIMIT = 500;

function boundedInteger(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function safeJson(value) {
  if (!value || typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function emptyMetrics() {
  return {
    capability_events: 0,
    started: 0,
    succeeded: 0,
    failed: 0,
    denied: 0,
    completed: 0,
    failure_rate: 0,
    p95_duration_ms: null,
    latest_event_at: null,
  };
}

/**
 * Read a bounded, aggregate-only observability window from D1 audit logs.
 * Raw request metadata, details, IPs, user agents and secret-shaped values are
 * never returned.
 */
export async function readRuntimeObservability({
  db,
  now = Date.now(),
  windowMs = DEFAULT_WINDOW_MS,
  limit = DEFAULT_LIMIT,
} = {}) {
  const observedAt = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const boundedWindow = boundedInteger(windowMs, DEFAULT_WINDOW_MS, 60_000, MAX_WINDOW_MS);
  const boundedLimit = boundedInteger(limit, DEFAULT_LIMIT, 20, MAX_LIMIT);
  const since = observedAt - boundedWindow;
  const base = {
    query_ok: false,
    status: 'UNAVAILABLE',
    window_ms: boundedWindow,
    row_limit: boundedLimit,
    observed_at: new Date(observedAt).toISOString(),
    metrics: emptyMetrics(),
  };

  if (!db || typeof db.prepare !== 'function') {
    return { ...base, reason: 'DB_UNAVAILABLE' };
  }

  try {
    const result = await db.prepare(`
      SELECT timestamp, action, details_json
      FROM audit_logs
      WHERE timestamp >= ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).bind(since, boundedLimit).all();

    const rows = Array.isArray(result?.results) ? result.results : [];
    const metrics = emptyMetrics();
    const durations = [];
    let latestTimestamp = 0;

    for (const row of rows) {
      if (String(row?.action || '') !== 'capability_bus') continue;
      const detail = safeJson(row?.details_json);
      const status = String(detail.status || '').toUpperCase();
      metrics.capability_events += 1;
      if (status === 'STARTED') metrics.started += 1;
      else if (status === 'SUCCEEDED') metrics.succeeded += 1;
      else if (status === 'FAILED') metrics.failed += 1;
      else if (status === 'DENIED') metrics.denied += 1;

      const duration = Number(detail.duration_ms);
      if ((status === 'SUCCEEDED' || status === 'FAILED') && Number.isFinite(duration) && duration >= 0) {
        durations.push(duration);
      }

      const ts = Number(row?.timestamp);
      if (Number.isFinite(ts) && ts > latestTimestamp) latestTimestamp = ts;
    }

    metrics.completed = metrics.succeeded + metrics.failed;
    metrics.failure_rate = metrics.completed > 0
      ? Number((metrics.failed / metrics.completed).toFixed(4))
      : 0;
    metrics.p95_duration_ms = percentile(durations, 0.95);
    metrics.latest_event_at = latestTimestamp > 0 ? new Date(latestTimestamp).toISOString() : null;

    const highFailureRate = metrics.completed >= 4 && metrics.failure_rate >= 0.25;
    const repeatedFailures = metrics.failed >= 3;
    const highLatency = Number(metrics.p95_duration_ms) > 5000;
    const status = repeatedFailures || highFailureRate
      ? 'ERROR'
      : metrics.failed > 0 || highLatency
        ? 'DEGRADED'
        : metrics.capability_events > 0
          ? 'OK'
          : 'IDLE';

    return {
      ...base,
      query_ok: true,
      status,
      reason: null,
      metrics,
    };
  } catch {
    return { ...base, reason: 'AUDIT_QUERY_FAILED' };
  }
}

export const OBSERVABILITY_LIMITS = Object.freeze({
  default_window_ms: DEFAULT_WINDOW_MS,
  max_window_ms: MAX_WINDOW_MS,
  default_row_limit: DEFAULT_LIMIT,
  max_row_limit: MAX_LIMIT,
});

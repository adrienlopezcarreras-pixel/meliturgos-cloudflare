// Observability of MEL's self-development: how each mentor model performs,
// why proposals are rejected, and which supervised jobs are stuck. Pure
// functions over dev_jobs rows, so the activity API can expose them as-is.

const obj = value => {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || '{}') || {}; } catch { return {}; }
};
const code = value => (/^[A-Z][A-Z0-9_:-]{0,119}$/.test(String(value || '')) ? String(value) : 'UNKNOWN');
const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
export const STALL_AFTER_MS = 2 * 60 * 60 * 1000;
export const REPEATED_REJECTION_THRESHOLD = 3;

/** Per mentor model: attempts, selections, rejections by code, success rate. */
export function mentorMetrics(jobs = []) {
  const models = new Map();
  const causes = {};
  const entry = id => {
    if (!models.has(id)) models.set(id, { provider: id, attempts: 0, selected: 0, rejected: 0, rejection_codes: {} });
    return models.get(id);
  };
  const reject = (provider, error) => {
    const row = entry(String(provider || 'unknown'));
    const c = code(error);
    row.rejected += 1;
    row.rejection_codes[c] = (row.rejection_codes[c] || 0) + 1;
    causes[c] = (causes[c] || 0) + 1;
  };
  for (const job of jobs) {
    const result = obj(job?.result_json);
    const council = obj(obj(result.bridge_preparation).mentor).council;
    if (council && typeof council === 'object') {
      for (const id of Array.isArray(council.providers_attempted) ? council.providers_attempted : []) entry(String(id)).attempts += 1;
      if (council.selected_provider) entry(String(council.selected_provider)).selected += 1;
      for (const row of Array.isArray(council.rejected_proposals) ? council.rejected_proposals : []) reject(row?.provider, row?.error);
    }
    // A preparation that produced no package only records its failures.
    const failures = obj(result.bridge_preparation_diagnostic).mentor_failure_codes;
    if (!council && Array.isArray(failures)) {
      const seen = new Set();
      for (const row of failures) {
        const id = String(row?.provider || 'unknown');
        if (!seen.has(id)) { entry(id).attempts += 1; seen.add(id); }
        reject(id, row?.code);
      }
    }
  }
  const list = [...models.values()].map(row => ({
    ...row,
    success_rate: row.attempts > 0 ? Math.round((row.selected / row.attempts) * 100) / 100 : null,
  })).sort((a, b) => b.selected - a.selected || b.attempts - a.attempts);
  const topCauses = Object.entries(causes).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c, count]) => ({ code: c, count }));
  return { models: list, rejection_causes: topCauses };
}

/** Alerts an owner should see without reading logs. */
export function pipelineAlerts(jobs = [], metrics = mentorMetrics(jobs), { now = Date.now() } = {}) {
  const alerts = [];
  for (const job of jobs) {
    const status = String(job?.status || '').toUpperCase();
    const age = now - Number(job?.updated_at || 0);
    if (!TERMINAL.has(status) && Number(job?.updated_at) > 0 && age > STALL_AFTER_MS) {
      alerts.push({ level: 'warning', code: 'JOB_STALLED', job_id: job.id || null, status, minutes: Math.round(age / 60000) });
    }
  }
  for (const model of metrics.models) {
    if (model.attempts >= REPEATED_REJECTION_THRESHOLD && model.selected === 0) {
      alerts.push({ level: 'warning', code: 'MENTOR_MODEL_NEVER_SELECTED', provider: model.provider, attempts: model.attempts });
    }
  }
  for (const cause of metrics.rejection_causes) {
    if (cause.count >= REPEATED_REJECTION_THRESHOLD * 3) alerts.push({ level: 'info', code: 'REPEATED_REJECTION', cause: cause.code, count: cause.count });
  }
  return alerts.slice(0, 20);
}

// Weekly audit of MEL's own development, not of its capabilities: which
// models really write the code, whether a model is silently excluded,
// whether missions are delivered or loop. Every finding becomes a repair
// mission through the self-audit supervisor, so MEL fixes what it measures.

import { mentorMetrics, pipelineAlerts } from '../evolution/autonomy-metrics.js';
import { standardRegistry } from '../models/ModelRegistry.js';
import { createDefaultAugmentioPool } from '../augmentio/default-pool.js';
import { ZeroEuroGovernor } from '../augmentio/zero-euro-governor.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const obj = value => {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || '{}') || {}; } catch { return {}; }
};

/** Code-specialised Workers AI models the governor would refuse at runtime. */
export function excludedCodeModels(env, { registry = standardRegistry } = {}) {
  const wanted = registry.list().filter(model => (model.capabilities || []).includes('CODE_SPECIALIST')).map(model => model.id);
  const governor = new ZeroEuroGovernor({ maxCost: 0 });
  // The governor decision needs no inference: a stub binding is enough here.
  const poolEnv = env?.AI?.run ? env : { ...env, AI: { run: async () => null } };
  const allowed = new Set(createDefaultAugmentioPool(poolEnv, { registry }).list({ capability: 'CODE_SPECIALIST' })
    .filter(provider => governor.allows(provider)).map(provider => provider.modelId));
  return wanted.filter(id => !allowed.has(id));
}

// Each code model gets a small real exercise: the answer must define the
// requested function and pass it. Proves the model still answers usable code.
const PROBE = 'Écris uniquement une fonction JavaScript nommée sumEven(list) qui renvoie la somme des nombres pairs du tableau list. Réponds avec le code seul.';
export async function probeCodeModels(env, { registry = standardRegistry, timeoutMs = 60_000 } = {}) {
  if (!env?.AI?.run) return [];
  const models = registry.list().filter(model => (model.capabilities || []).includes('CODE_SPECIALIST'));
  return Promise.all(models.map(async model => {
    const started = Date.now();
    try {
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('PROBE_TIMEOUT')), timeoutMs);
      });
      let out;
      try {
        out = await Promise.race([
          env.AI.run(model.id, { messages: [{ role: 'user', content: PROBE }], max_tokens: 800 }),
          timeout,
        ]);
      } finally {
        clearTimeout(timer);
      }
      const text = String(out?.response ?? out?.choices?.[0]?.message?.content ?? out?.output_text ?? '');
      const code = (text.match(/```(?:js|javascript)?\s*([\s\S]*?)```/) || [null, text])[1];
      // eslint-disable-next-line no-new-func
      const sumEven = new Function(code + '\nreturn typeof sumEven === "function" ? sumEven : null;')();
      const passed = typeof sumEven === 'function' && sumEven([1, 2, 3, 4, 7, 10]) === 16 && sumEven([]) === 0;
      return { model: model.id, passed, ms: Date.now() - started };
    } catch (error) {
      return { model: model.id, passed: false, ms: Date.now() - started, error: String(error?.message || error).slice(0, 80) };
    }
  }));
}

export function auditDevelopment({ jobs = [], env = {}, registry = standardRegistry, now = Date.now(), maxAutonomy = true, probes = [] } = {}) {
  // Exclude future timestamps and duplicate snapshots of the same durable job.
  // Different job ids for the same roadmap objective remain distinct attempts.
  const seenJobs = new Set();
  const week = jobs.filter(job => {
    const updated = Number(job?.updated_at || 0);
    return Number.isFinite(updated) && updated >= now - WEEK_MS && updated <= now;
  }).sort((a, b) => Number(b.updated_at) - Number(a.updated_at)).filter(job => {
    const id = String(job?.id || '');
    if (!id) return true;
    if (seenJobs.has(id)) return false;
    seenJobs.add(id);
    return true;
  });
  const findings = [];
  const findingKeys = new Set();
  const add = (code, detail) => {
    const finding = { code, detail: String(detail).slice(0, 300) };
    const key = JSON.stringify(finding);
    if (!findingKeys.has(key)) { findings.push(finding); findingKeys.add(key); }
  };

  const specialists = new Set(registry.list().filter(model => (model.capabilities || []).includes('CODE_SPECIALIST')).map(model => 'workers-ai:' + model.id));
  const metrics = mentorMetrics(week);
  const generalist = metrics.models.filter(model => model.selected > 0 && !specialists.has(model.provider));
  if (generalist.length) add('MENTOR_CODED_WITH_NON_CODE_MODEL', generalist.map(model => model.provider + ' ×' + model.selected).join(', '));

  const excluded = excludedCodeModels(env, { registry });
  if (excluded.length) add('CODE_MODEL_EXCLUDED_BY_ZERO_COST_PROOF', excluded.join(', '));

  for (const alert of pipelineAlerts(week, metrics, { now })) {
    if (alert.code === 'MENTOR_MODEL_NEVER_SELECTED') add(alert.code, alert.provider + ' (' + alert.attempts + ' tentatives)');
    if (alert.code === 'REPEATED_REJECTION') add(alert.code, alert.cause + ' ×' + alert.count);
  }
  const broken = probes.filter(probe => !probe.passed);
  if (broken.length) add('CODE_MODEL_PROBE_FAILED', broken.map(probe => probe.model + (probe.error ? ' (' + probe.error + ')' : '')).join(', '));
  const stalled = pipelineAlerts(week, metrics, { now }).filter(alert => alert.code === 'JOB_STALLED');
  if (stalled.length) add('JOBS_STALLED', stalled.map(alert => alert.job_id).slice(0, 5).join(', '));

  const deliveredStatuses = new Set(['COMPLETED', 'DONE', 'DONE_VERIFIED', 'VERIFIED', 'ACCEPTED']);
  const completed = week.filter(job => deliveredStatuses.has(String(job?.status).toUpperCase())).length;
  const councilRejected = week.filter(job => /COUNCIL_REJECTED/.test(String(job?.error || ''))).length;
  const failed = week.filter(job => String(job?.status).toUpperCase() === 'FAILED').length;
  if (maxAutonomy && week.length && completed === 0) add('NO_DELIVERY_THIS_WEEK', week.length + ' missions, 0 livrée, ' + failed + ' en échec');
  if (councilRejected > completed) add('COUNCIL_REJECTS_MORE_THAN_DELIVERED', councilRejected + ' refus pour ' + completed + ' livraisons');

  // Same roadmap item retried over and over: the mission loops instead of progressing.
  const tries = {};
  for (const job of week) {
    const id = obj(job?.optional_context).roadmap_id;
    if (id) tries[id] = (tries[id] || 0) + 1;
  }
  const loops = Object.entries(tries).filter(([, count]) => count >= 4);
  if (loops.length) add('MISSION_LOOP', loops.map(([id, count]) => id + ' ×' + count).join(', '));

  return {
    ok: findings.length === 0,
    status: findings.length ? 'DEVELOPMENT_AUDIT_FAILED' : 'DEVELOPMENT_AUDIT_OK',
    findings,
    probes,
    summary: {
      jobs: week.length, completed, failed,
      blocked: week.filter(job => ['BLOCKED', 'WAITING_DEPENDENCY'].includes(String(job?.status || '').toUpperCase())).length,
      repeated_objectives: loops.length,
      council_rejected: councilRejected, models: metrics.models.length,
    },
  };
}

/**
 * Durable weekly evidence for MEL-AUDIT-02. This records observations only:
 * no status transitions, roadmap admissions or repair dispatches. A repeated
 * invocation updates the same weekly report and cannot duplicate findings.
 */
export async function persistWeeklyDevelopmentAudit(db, report, { now = Date.now() } = {}) {
  if (!db?.prepare || !report || !Array.isArray(report.findings)) {
    throw Object.assign(new Error('DEVELOPMENT_AUDIT_PERSIST_INPUT_REQUIRED'), { code: 'DEVELOPMENT_AUDIT_PERSIST_INPUT_REQUIRED' });
  }
  const at = Number(now);
  if (!Number.isFinite(at)) throw Object.assign(new Error('DEVELOPMENT_AUDIT_TIME_INVALID'), { code: 'DEVELOPMENT_AUDIT_TIME_INVALID' });
  // ISO-style UTC weeks begin Monday; 1970-01-05 was the first Monday.
  const mondayOffset = 4 * 24 * 60 * 60 * 1000;
  const weekStart = Math.floor((at - mondayOffset) / WEEK_MS) * WEEK_MS + mondayOffset;
  await db.prepare(`CREATE TABLE IF NOT EXISTS mel_development_audit_reports (
    week_start INTEGER PRIMARY KEY, report_json TEXT NOT NULL, updated_at INTEGER NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS mel_development_audit_findings (
    week_start INTEGER NOT NULL, code TEXT NOT NULL, detail TEXT NOT NULL,
    PRIMARY KEY (week_start, code, detail)
  )`).run();
  await db.prepare(`INSERT INTO mel_development_audit_reports(week_start,report_json,updated_at)
    VALUES(?,?,?) ON CONFLICT(week_start) DO UPDATE SET
      report_json=excluded.report_json, updated_at=excluded.updated_at`)
    .bind(weekStart, JSON.stringify(report), at).run();
  const distinct = new Map();
  for (const finding of report.findings) {
    const code = String(finding?.code || '').slice(0, 120);
    if (!code) continue;
    const detail = String(finding?.detail || '').slice(0, 300);
    distinct.set(JSON.stringify([code, detail]), { code, detail });
  }
  for (const { code, detail } of distinct.values()) {
    await db.prepare(`INSERT INTO mel_development_audit_findings(week_start,code,detail)
      VALUES(?,?,?) ON CONFLICT(week_start,code,detail) DO NOTHING`)
      .bind(weekStart, code, detail).run();
  }
  return { persisted: true, week_start: weekStart, findings_recorded: distinct.size };
}

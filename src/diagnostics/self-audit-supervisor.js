import { runLoraTrainingHeartbeat } from '../learning/lora-training-heartbeat.js';
import { runEcosystemCapabilityWatch } from '../evaluation/capability-watch-runtime.js';
import { runDependencyLongevityWatchRuntime } from '../evaluation/dependency-longevity-watch-runtime.js';
import { runSovereigntyReplacementWatchRuntime } from '../evaluation/sovereignty-watch-runtime.js';
import { runConfiguredAiCandidateValidationRuntime } from '../portability/configured-ai-candidate-validation-runtime.js';
import { runCompanionSourceControlPrevalidationRuntime } from '../portability/companion-source-control-prevalidation-runtime.js';
import { runCompanionInfrastructurePrevalidationRuntime } from '../portability/companion-infrastructure-prevalidation-runtime.js';
import { D1AlternativeRegistryStore } from '../portability/d1-alternative-registry-store.js';
import { liveTechnicalSovereigntyReport } from '../portability/technical-sovereignty-live.js';
import { runScheduledSystemBackup } from '../backup/system-backup-runtime.js';
import { readPersistentCapabilityStress } from './persistent-capability-stress.js';
import { getAutonomyControl } from '../evolution/autonomy-control.js';
import { enqueueSupervisedDevelopmentRequest } from '../evolution/owner-development-queue.js';

export const MEL_SELF_AUDIT_STATE_ID = 'mel-self-audit-supervisor';
export const MEL_SELF_AUDIT_LEVELS = Object.freeze(['HEARTBEAT','DAILY','WEEKLY','MONTHLY']);
export const MEL_SELF_AUDIT_CADENCE_MS = Object.freeze({
  HEARTBEAT: 60 * 60 * 1000,
  DAILY: 24 * 60 * 60 * 1000,
  WEEKLY: 7 * 24 * 60 * 60 * 1000,
  MONTHLY: 30 * 24 * 60 * 60 * 1000,
});

const LEVEL_RANK = new Map(MEL_SELF_AUDIT_LEVELS.map((level, index) => [level, index]));
const MAX_FAILURE_STREAK = 100;
const MAX_REPAIR_HISTORY = 100;

function clean(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function safeError(error) {
  return clean(error?.code || error?.message || error || 'SELF_AUDIT_FAILED', 180);
}

function resolvedCadence(env = {}) {
  const hour = 60 * 60 * 1000;
  const bounded = (value, fallback, min, max) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  };
  return Object.freeze({
    HEARTBEAT: bounded(env?.MEL_SELF_AUDIT_HEARTBEAT_MS, MEL_SELF_AUDIT_CADENCE_MS.HEARTBEAT, 15 * 60 * 1000, 6 * hour),
    DAILY: bounded(env?.MEL_SELF_AUDIT_DAILY_MS, MEL_SELF_AUDIT_CADENCE_MS.DAILY, 6 * hour, 48 * hour),
    WEEKLY: bounded(env?.MEL_SELF_AUDIT_WEEKLY_MS, MEL_SELF_AUDIT_CADENCE_MS.WEEKLY, 3 * 24 * hour, 14 * 24 * hour),
    MONTHLY: bounded(env?.MEL_SELF_AUDIT_MONTHLY_MS, MEL_SELF_AUDIT_CADENCE_MS.MONTHLY, 14 * 24 * hour, 60 * 24 * hour),
  });
}

function nowMs(value = Date.now()) {
  const n = value instanceof Date ? value.getTime() : Number(value);
  return Number.isFinite(n) ? n : Date.now();
}

function iso(value) {
  return new Date(nowMs(value)).toISOString();
}

function defaultState() {
  return {
    schema: 'mel.self-audit-supervisor/v1',
    last_runs: Object.fromEntries(MEL_SELF_AUDIT_LEVELS.map(level => [level, 0])),
    failure_streaks: {},
    repair_fingerprints: [],
    capability_ledger: {},
    survival_ledger: {},
    last_report: null,
    updated_at: 0,
  };
}

export class D1SelfAuditStateStore {
  constructor(db) {
    if (!db?.prepare) throw Object.assign(new Error('SELF_AUDIT_DB_REQUIRED'), { code: 'SELF_AUDIT_DB_REQUIRED' });
    this.db = db;
    this.readyPromise = null;
  }

  async ready() {
    if (!this.readyPromise) {
      this.readyPromise = this.db.prepare(`CREATE TABLE IF NOT EXISTS mel_self_audit_state (
        id TEXT PRIMARY KEY,
        state_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`).run();
    }
    await this.readyPromise;
    return this;
  }

  async load() {
    await this.ready();
    const row = await this.db.prepare('SELECT state_json,updated_at FROM mel_self_audit_state WHERE id=?')
      .bind(MEL_SELF_AUDIT_STATE_ID).first();
    if (!row?.state_json) return defaultState();
    try {
      const parsed = JSON.parse(row.state_json);
      return {
        ...defaultState(),
        ...parsed,
        last_runs: { ...defaultState().last_runs, ...(parsed?.last_runs || {}) },
        failure_streaks: parsed?.failure_streaks && typeof parsed.failure_streaks === 'object'
          ? parsed.failure_streaks
          : {},
        repair_fingerprints: Array.isArray(parsed?.repair_fingerprints)
          ? parsed.repair_fingerprints.slice(-MAX_REPAIR_HISTORY)
          : [],
        capability_ledger: parsed?.capability_ledger && typeof parsed.capability_ledger === 'object'
          ? parsed.capability_ledger
          : {},
        survival_ledger: parsed?.survival_ledger && typeof parsed.survival_ledger === 'object'
          ? parsed.survival_ledger
          : {},
        updated_at: Number(row.updated_at || parsed?.updated_at || 0),
      };
    } catch {
      return defaultState();
    }
  }

  async save(state) {
    await this.ready();
    const updatedAt = Date.now();
    const value = {
      ...defaultState(),
      ...(state || {}),
      updated_at: updatedAt,
      repair_fingerprints: Array.isArray(state?.repair_fingerprints)
        ? state.repair_fingerprints.slice(-MAX_REPAIR_HISTORY)
        : [],
    };
    await this.db.prepare(`INSERT INTO mel_self_audit_state(id,state_json,updated_at)
      VALUES(?,?,?)
      ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`)
      .bind(MEL_SELF_AUDIT_STATE_ID, JSON.stringify(value), updatedAt).run();
    return value;
  }
}

function normalizedLevel(value, fallback = 'MONTHLY') {
  const level = clean(value, 32).toUpperCase();
  return LEVEL_RANK.has(level) ? level : fallback;
}

export function dueSelfAuditLevels(state = {}, now = Date.now(), {
  maxLevel = 'MONTHLY',
  forceLevel = null,
  cadence = MEL_SELF_AUDIT_CADENCE_MS,
} = {}) {
  const ceiling = LEVEL_RANK.get(normalizedLevel(maxLevel)) ?? LEVEL_RANK.get('MONTHLY');
  const forced = forceLevel ? normalizedLevel(forceLevel, null) : null;
  const current = nowMs(now);
  return MEL_SELF_AUDIT_LEVELS.filter(level => {
    if ((LEVEL_RANK.get(level) ?? 99) > ceiling) return false;
    if (forced) return (LEVEL_RANK.get(level) ?? 99) <= (LEVEL_RANK.get(forced) ?? -1);
    const last = Number(state?.last_runs?.[level] || 0);
    const interval = Math.max(60_000, Number(cadence?.[level] || MEL_SELF_AUDIT_CADENCE_MS[level]));
    return last <= 0 || current - last >= interval;
  });
}

export function persistentStressFailures(job) {
  const rows = Array.isArray(job?.report?.capabilities) ? job.report.capabilities : [];
  return rows
    .filter(row => row?.truth_status === 'EXISTANT_MAIS_ECHEC_RUNTIME')
    .map(row => ({
      id: clean(row?.id, 160),
      code: clean(row?.execution?.code || 'CAPABILITY_RUNTIME_FAILED', 180),
      risk: clean(row?.risk, 40) || null,
    }))
    .filter(row => row.id)
    .slice(0, 40);
}

function stressEvidenceAt(job) {
  const value = Number(job?.completed_at || job?.report?.completed_at || job?.updated_at || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function buildCapabilityHealthLedger(previous = {}, capabilities = [], stressJob = null, {
  now = Date.now(),
  heartbeatMs = MEL_SELF_AUDIT_CADENCE_MS.HEARTBEAT,
  weeklyMs = MEL_SELF_AUDIT_CADENCE_MS.WEEKLY,
} = {}) {
  const current = nowMs(now);
  const stressAt = stressEvidenceAt(stressJob);
  const stressJobId = clean(stressJob?.job_id || stressJob?.id || '', 200) || null;
  const stressRows = new Map(
    (Array.isArray(stressJob?.report?.capabilities) ? stressJob.report.capabilities : [])
      .map(row => [clean(row?.id, 160), row])
      .filter(([id]) => Boolean(id)),
  );
  const next = {};

  for (const capability of Array.isArray(capabilities) ? capabilities : []) {
    const id = clean(capability?.id, 160);
    if (!id) continue;
    const prior = previous?.[id] && typeof previous[id] === 'object' ? previous[id] : {};
    const evidence = stressRows.get(id) || null;
    const tested = evidence?.tested_now === true && Boolean(evidence?.execution) && stressAt > 0;
    const executionOk = tested ? evidence.execution?.ok === true : null;
    const lastTestedAt = tested ? stressAt : Number(prior.last_tested_at || 0);
    const lastSuccessAt = tested && executionOk === true ? stressAt : Number(prior.last_test_success_at || 0);
    const lastFailureAt = tested && executionOk === false ? stressAt : Number(prior.last_test_failure_at || 0);
    const latency = tested && Number.isFinite(Number(evidence?.execution?.duration_ms))
      ? Math.max(0, Number(evidence.execution.duration_ms))
      : (Number.isFinite(Number(prior.latency_ms)) ? Number(prior.latency_ms) : null);
    const lastError = tested && executionOk === false
      ? clean(evidence?.execution?.code || 'CAPABILITY_RUNTIME_FAILED', 180)
      : tested && executionOk === true
        ? null
        : (clean(prior.last_error || '', 180) || null);

    next[id] = {
      id,
      name: clean(capability?.name, 240) || null,
      category: clean(capability?.category, 120) || null,
      provider: clean(capability?.provider, 160) || null,
      risk: clean(capability?.risk, 40) || null,
      enabled: capability?.enabled !== false,
      health: clean(capability?.health || 'UNKNOWN', 80).toUpperCase(),
      health_detail: clean(capability?.health_detail || '', 240) || null,
      last_checked_at: current,
      next_check_at: current + Math.max(60_000, Number(heartbeatMs) || MEL_SELF_AUDIT_CADENCE_MS.HEARTBEAT),
      last_tested_at: lastTestedAt || null,
      last_test_success_at: lastSuccessAt || null,
      last_test_failure_at: lastFailureAt || null,
      last_error: lastError,
      latency_ms: latency,
      truth_status: clean(evidence?.truth_status || prior.truth_status || '', 100) || null,
      contract_valid: evidence?.contract_valid === true
        ? true
        : evidence?.contract_valid === false
          ? false
          : (prior.contract_valid ?? null),
      auto_execution_blocked: evidence
        ? (clean(evidence?.auto_execution_blocked || '', 180) || null)
        : (clean(prior.auto_execution_blocked || '', 180) || null),
      stress_job_id: tested ? stressJobId : (prior.stress_job_id || null),
      stale_test: !lastTestedAt || current - lastTestedAt > Math.max(60_000, Number(weeklyMs) || MEL_SELF_AUDIT_CADENCE_MS.WEEKLY),
    };
  }

  return next;
}

export function capabilityLedgerSummary(ledger = {}) {
  const rows = Object.values(ledger || {});
  return {
    total: rows.length,
    healthy: rows.filter(row => row.enabled === true && row.health === 'HEALTHY').length,
    degraded: rows.filter(row => row.health === 'DEGRADED').length,
    unavailable: rows.filter(row => row.enabled === false || row.health === 'UNAVAILABLE').length,
    stale_tests: rows.filter(row => row.stale_test === true).length,
    last_test_failures: rows.filter(row => Boolean(row.last_test_failure_at)
      && Number(row.last_test_failure_at) >= Number(row.last_test_success_at || 0)).length,
  };
}

function compactTaskResult(value) {
  if (!value || typeof value !== 'object') return value;
  const status = clean(value.status || value.reason || '', 160) || null;
  return {
    ok: value.ok !== false,
    skipped: value.skipped === true,
    status,
    error: clean(value.error || value.code || '', 180) || null,
    job_id: clean(value.job_id || value.id || '', 200) || null,
    prevalidated: Number.isFinite(Number(value.prevalidated)) ? Number(value.prevalidated) : undefined,
    blocked: Number.isFinite(Number(value.blocked)) ? Number(value.blocked) : undefined,
    candidate_count: Number.isFinite(Number(value.candidate_count)) ? Number(value.candidate_count) : undefined,
    source_sha: clean(value.source_sha || '', 80) || undefined,
  };
}

async function capture(name, fn) {
  try {
    const value = await fn();
    const status = String(value?.status || '');
    const failed = value?.ok === false
      || /(?:ERROR|FAILED|BLOCKED|EMERGENCY|MIGRATION_REQUIRED)$/i.test(status)
      || status === 'DEGRADED';
    return { name, ok: !failed, value, compact: compactTaskResult(value), error: failed ? clean(value?.error || value?.code || value?.status, 180) : null };
  } catch (error) {
    return { name, ok: false, value: null, compact: { ok: false, error: safeError(error) }, error: safeError(error) };
  }
}

function updateFailureStreaks(previous = {}, results = []) {
  const next = { ...(previous || {}) };
  for (const result of results) {
    const key = clean(result?.name, 120);
    if (!key) continue;
    next[key] = result?.ok === true
      ? 0
      : Math.min(MAX_FAILURE_STREAK, Number(next[key] || 0) + 1);
  }
  return next;
}

function recurringTaskFailures(streaks = {}, threshold = 2) {
  return Object.entries(streaks)
    .filter(([, count]) => Number(count) >= threshold)
    .map(([name, count]) => ({ name, streak: Number(count) }))
    .slice(0, 20);
}

function failureFingerprint({ stressJobId = '', capabilityIds = [], recurring = [] } = {}) {
  const caps = [...new Set(capabilityIds.map(value => clean(value, 160)).filter(Boolean))].sort();
  const tasks = [...new Set(recurring.map(row => clean(row?.name, 120)).filter(Boolean))].sort();
  return [clean(stressJobId, 200), caps.join(','), tasks.join(',')].join('|').slice(0, 1200);
}

async function readLatestStress(env) {
  if (!env?.DB) return null;
  try { return await readPersistentCapabilityStress({ db: env.DB }); }
  catch { return null; }
}

async function currentSovereignty(env, maxAutonomy = false) {
  if (!env?.DB) return null;
  try {
    const registry = await new D1AlternativeRegistryStore(env.DB).load();
    const report = liveTechnicalSovereigntyReport(registry, { maxAutonomy, now: Date.now() });
    return {
      fully_sovereign: report?.fully_sovereign === true,
      ready_layer_count: Number(report?.ready_layer_count || 0),
      layer_count: Number(report?.layer_count || 0),
      blocked_layers: Array.isArray(report?.blocked_layers)
        ? report.blocked_layers.map(row => ({ id: clean(row?.id, 80), blockers: Array.isArray(row?.blockers) ? row.blockers.slice(0, 10) : [] }))
        : [],
      registry_count: Array.isArray(registry?.all) ? registry.all.length : 0,
      layers: Object.fromEntries(Object.entries(report?.layers || {}).map(([id, row]) => [id, {
        id,
        ready: row?.ready === true,
        current_adapter: clean(row?.current_adapter || '', 200) || null,
        alternative_adapters: Array.isArray(row?.alternative_adapters) ? row.alternative_adapters.slice(0, 20) : [],
        rollback_verified: row?.capabilities?.rollback === true,
        export_verified: row?.capabilities?.export === true,
        import_verified: row?.capabilities?.import === true,
        isolated_test_verified: row?.capabilities?.isolated_test === true,
        activate_verified: row?.capabilities?.activate === true,
        smoke_verified: row?.capabilities?.smoke === true,
        blockers: Array.isArray(row?.blockers) ? row.blockers.slice(0, 12) : [],
      }])),
    };
  } catch (error) {
    return { error: safeError(error), fully_sovereign: false, ready_layer_count: 0, layer_count: 10, blocked_layers: [], registry_count: 0 };
  }
}

async function runCouncilRepairAnalysis(bus, context, problem) {
  if (!bus || !problem) return null;
  try {
    const result = await bus.execute('model.council', {
      request: {
        kind: 'MEL_SELF_AUDIT_REPAIR',
        problem,
        instruction: 'Diagnose la cause probable, propose la correction la plus petite et testable, conserve les garde-fous, aucun coût ajouté, aucune suppression irréversible et aucun contournement des approbations.',
      },
      capability: 'GENERAL',
      maxCandidates: 4,
      timeoutMs: 30000,
    }, context);
    return {
      ok: true,
      status: clean(result?.status || 'COMPLETE', 120),
      independent_response_count: Number(result?.independent_response_count || 0),
      unique_model_count: Number(result?.unique_model_count || 0),
      synthesis_status: clean(result?.synthesis?.status || '', 120) || null,
    };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}

async function maybeQueueRepair({
  env,
  bus,
  control,
  failures,
  recurring,
  fingerprint,
  previousFingerprints,
  enqueueDevelopment = enqueueSupervisedDevelopmentRequest,
} = {}) {
  if (!fingerprint || previousFingerprints.includes(fingerprint)) {
    return { queued: false, reason: 'ALREADY_HANDLED' };
  }
  if (control?.max_autonomy !== true) {
    return { queued: false, reason: 'MAX_AUTONOMY_REQUIRED' };
  }
  const firstCapability = failures?.[0]?.id || '';
  const taskNames = recurring.map(row => row.name);
  const goal = [
    '[MEL-SELF-AUDIT] Corriger une anomalie détectée automatiquement.',
    failures?.length ? `Capacités en échec runtime: ${failures.map(row => row.id).join(', ')}.` : '',
    taskNames.length ? `Contrôles récurrents en échec: ${taskNames.join(', ')}.` : '',
    'Inspecter les preuves, lancer Council, corriger sur branche candidate, tester, benchmarker et ne jamais déployer hors release gate.',
  ].filter(Boolean).join(' ');

  try {
    const result = await enqueueDevelopment({
      env,
      goal,
      requestKey: `self-audit:${fingerprint}`,
      requestedBy: 'mel-autonomy',
      source: 'self-audit-supervisor',
      priority: 'P0',
      extensionKind: 'module',
      allowBlockedExisting: true,
      allowExistingOptimization: true,
      targetCapabilityId: firstCapability,
      capabilities: bus?.list?.() || [],
      evidence: {
        fingerprint,
        capability_hint: firstCapability || null,
        citations_count: 0,
        observed_on: ['self-audit-supervisor'],
        sources: [],
      },
      inspectionQueries: failures.map(row => row.id).slice(0, 8),
    });
    return {
      queued: Boolean(result?.job_id),
      job_id: result?.job_id || null,
      status: result?.status || null,
      reason: result?.job_id ? null : 'NO_DEVELOPMENT_JOB_CREATED',
    };
  } catch (error) {
    return { queued: false, reason: safeError(error) };
  }
}

export async function readMelSelfAuditStatus(env, { stateStore = null } = {}) {
  if (!env?.DB && !stateStore) return { ok: false, status: 'SELF_AUDIT_DB_UNAVAILABLE' };
  const store = stateStore || new D1SelfAuditStateStore(env.DB);
  const state = await store.load();
  const stress = await readLatestStress(env);
  return {
    ok: true,
    status: 'SELF_AUDIT_STATUS',
    cadence_ms: resolvedCadence(env),
    state,
    latest_stress: stress ? {
      job_id: stress.job_id || stress.id || null,
      status: stress.status || null,
      progress: stress.progress || null,
      completed_at: stress.completed_at || null,
      failures: persistentStressFailures(stress),
    } : null,
  };
}

export async function runMelSelfAuditSupervisor(env = {}, {
  bus,
  waitUntil = null,
  now = Date.now(),
  maxLevel = 'MONTHLY',
  forceLevel = null,
  stateStore = null,
  deps = {},
} = {}) {
  if (!env?.DB && !stateStore) return { ok: true, skipped: true, status: 'SELF_AUDIT_DB_UNAVAILABLE' };
  if (!bus?.list || !bus?.execute) throw Object.assign(new Error('SELF_AUDIT_CAPABILITY_BUS_REQUIRED'), { code: 'SELF_AUDIT_CAPABILITY_BUS_REQUIRED' });

  const current = nowMs(now);
  const store = stateStore || new D1SelfAuditStateStore(env.DB);
  const state = await store.load();
  const cadence = resolvedCadence(env);
  const due = dueSelfAuditLevels(state, current, { maxLevel, forceLevel, cadence });
  if (!due.length) {
    return { ok: true, skipped: true, status: 'SELF_AUDIT_NOT_DUE', next: state.last_report || null };
  }

  const context = {
    owner: env.MELITURGOS_USER || 'owner',
    permissions: env.CAPABILITY_PERMISSIONS || [],
    approvedCapabilities: [],
    requestId: crypto.randomUUID(),
    ...(typeof waitUntil === 'function' ? { waitUntil } : {}),
  };
  const control = deps.getAutonomyControl
    ? await deps.getAutonomyControl(env?.DB)
    : await getAutonomyControl(env?.DB).catch(() => ({ max_autonomy: false, paused: true }));
  const previousStress = deps.readLatestStress
    ? await deps.readLatestStress()
    : await readLatestStress(env);
  const previousStressFailures = persistentStressFailures(previousStress);
  const results = [];

  if (due.includes('HEARTBEAT')) {
    const capabilities = bus.list();
    const counts = capabilities.reduce((acc, row) => {
      const health = clean(row?.health || 'UNKNOWN', 80).toUpperCase();
      acc[health] = (acc[health] || 0) + 1;
      return acc;
    }, {});
    results.push({
      name: 'capability-heartbeat',
      ok: true,
      value: { total: capabilities.length, counts },
      compact: { ok: true, status: 'HEARTBEAT_OK', total: capabilities.length, counts },
      error: null,
    });
  }

  if (due.includes('DAILY')) {
    results.push(await capture('capability-health-refresh', async () => {
      const rows = await bus.refreshHealthAll();
      const unhealthy = rows.filter(row => ['UNAVAILABLE','DEGRADED'].includes(String(row?.health || '').toUpperCase()));
      return { ok: true, status: 'HEALTH_REFRESHED', total: rows.length, unhealthy_count: unhealthy.length };
    }));
    results.push(await capture('data-integrity', async () => {
      const value = await bus.execute('system.integrity', {}, context);
      return { ...value, status: value?.ok === false ? 'INTEGRITY_FAILED' : 'INTEGRITY_OK' };
    }));
    results.push(await capture('lora-heartbeat', async () => (deps.runLoraTrainingHeartbeat || runLoraTrainingHeartbeat)(env, { force: true, now: () => current })));
    results.push(await capture('ecosystem-watch', async () => (deps.runEcosystemCapabilityWatch || runEcosystemCapabilityWatch)(env, { force: true, sourceSha: clean(env.MEL_DEPLOYED_GIT_SHA, 80) || null })));
    results.push(await capture('dependency-longevity', async () => (deps.runDependencyLongevityWatchRuntime || runDependencyLongevityWatchRuntime)(env, { force: true, now: current })));
    results.push(await capture('sovereignty-watch', async () => (deps.runSovereigntyReplacementWatchRuntime || runSovereigntyReplacementWatchRuntime)(env, { force: true, now: current })));
    results.push(await capture('sovereignty-ai-prevalidation', async () => (deps.runConfiguredAiCandidateValidationRuntime || runConfiguredAiCandidateValidationRuntime)(env, { force: true, now: current, limit: 4 })));
  }

  let startedStress = null;
  if (due.includes('WEEKLY')) {
    results.push(await capture('maturity-audit', async () => {
      const value = await bus.execute('system.maturity', {}, context);
      return { ...value, status: value?.ok === false ? 'MATURITY_FAILED' : 'MATURITY_OK' };
    }));
    const stressResult = await capture('weekly-capability-stress', async () => bus.execute('capability.audit', { deep: true }, context));
    results.push(stressResult);
    startedStress = stressResult.value || null;
  }

  if (due.includes('MONTHLY')) {
    results.push(await capture('monthly-system-backup-drill', async () => (deps.runScheduledSystemBackup || runScheduledSystemBackup)(env, {
      force: true,
      compactPostPersistVerify: true,
      now: () => iso(current),
    })));
    results.push(await capture('source-control-alternative-drill', async () => (deps.runCompanionSourceControlPrevalidationRuntime || runCompanionSourceControlPrevalidationRuntime)(env, { force: true, now: current })));
    results.push(await capture('infrastructure-alternative-drill', async () => (deps.runCompanionInfrastructurePrevalidationRuntime || runCompanionInfrastructurePrevalidationRuntime)(env, { force: true, now: current })));
  }

  const failureStreaks = updateFailureStreaks(state.failure_streaks, results);
  const recurring = recurringTaskFailures(failureStreaks, 2);
  const fingerprint = failureFingerprint({
    stressJobId: previousStress?.job_id || previousStress?.id || '',
    capabilityIds: previousStressFailures.map(row => row.id),
    recurring,
  });
  const repairNeeded = previousStressFailures.length > 0 || recurring.length > 0;

  let council = null;
  let repair = null;
  let repairFingerprints = Array.isArray(state.repair_fingerprints) ? [...state.repair_fingerprints] : [];
  if (repairNeeded && fingerprint && !repairFingerprints.includes(fingerprint)) {
    council = await runCouncilRepairAnalysis(bus, context, {
      stress_job_id: previousStress?.job_id || previousStress?.id || null,
      capability_failures: previousStressFailures,
      recurring_task_failures: recurring,
    });
    repair = await maybeQueueRepair({
      env,
      bus,
      control,
      failures: previousStressFailures,
      recurring,
      fingerprint,
      previousFingerprints: repairFingerprints,
      enqueueDevelopment: deps.enqueueDevelopment || enqueueSupervisedDevelopmentRequest,
    });
    if (council?.ok === true || repair?.queued === true) {
      repairFingerprints.push(fingerprint);
      repairFingerprints = repairFingerprints.slice(-MAX_REPAIR_HISTORY);
    }
  }

  const sovereignty = due.includes('MONTHLY') || due.includes('WEEKLY')
    ? await currentSovereignty(env, control?.max_autonomy === true)
    : null;
  const taskFailures = results.filter(row => row.ok !== true).map(row => ({ name: row.name, error: row.error || row.compact?.error || 'FAILED' }));

  const lastRuns = { ...(state.last_runs || {}) };
  for (const level of due) lastRuns[level] = current;

  const capabilityLedger = buildCapabilityHealthLedger(
    state.capability_ledger || {},
    bus.list(),
    previousStress,
    {
      now: current,
      heartbeatMs: cadence.HEARTBEAT,
      weeklyMs: cadence.WEEKLY,
    },
  );
  const capabilityHealth = capabilityLedgerSummary(capabilityLedger);
  const survivalLedger = sovereignty?.layers
    ? Object.fromEntries(Object.entries(sovereignty.layers).map(([id, row]) => [id, {
        ...row,
        last_checked_at: current,
        next_check_at: current + cadence.MONTHLY,
      }]))
    : (state.survival_ledger || {});

  const report = {
    schema: 'mel.self-audit-report/v1',
    generated_at: iso(current),
    levels: due,
    max_autonomy: control?.max_autonomy === true,
    paused: control?.paused === true,
    capability_count: bus.list().length,
    capability_health: capabilityHealth,
    survival_health: {
      layer_count: Object.keys(survivalLedger).length,
      ready_layers: Object.values(survivalLedger).filter(row => row?.ready === true).length,
      rollback_verified_layers: Object.values(survivalLedger).filter(row => row?.rollback_verified === true).length,
    },
    task_count: results.length,
    task_failure_count: taskFailures.length,
    tasks: Object.fromEntries(results.map(row => [row.name, row.compact])),
    previous_stress: previousStress ? {
      job_id: previousStress.job_id || previousStress.id || null,
      status: previousStress.status || null,
      failure_count: previousStressFailures.length,
      failures: previousStressFailures,
    } : null,
    started_stress: startedStress ? {
      job_id: startedStress.job_id || startedStress.id || null,
      status: startedStress.status || null,
    } : null,
    recurring_failures: recurring,
    council,
    repair,
    sovereignty,
    cadence_ms: cadence,
    policy: {
      hourly_lightweight_heartbeat: true,
      daily_health_and_watch: true,
      weekly_full_capability_stress: true,
      monthly_non_destructive_survival_drill: true,
      destructive_production_restore: false,
      repair_requires_max_autonomy: true,
      council_before_repair: true,
      zero_added_cost: true,
      owner_shutdown_always_wins: true,
    },
  };

  await store.save({
    ...state,
    last_runs: lastRuns,
    failure_streaks: failureStreaks,
    repair_fingerprints: repairFingerprints,
    capability_ledger: capabilityLedger,
    survival_ledger: survivalLedger,
    last_report: report,
  });

  return {
    ok: taskFailures.length === 0,
    skipped: false,
    status: taskFailures.length ? 'SELF_AUDIT_DEGRADED' : 'SELF_AUDIT_OK',
    report,
  };
}

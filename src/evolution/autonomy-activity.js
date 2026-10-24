// Detailed, read-only view of what MEL is doing, for the « Activité » panel.
//
// Everything comes from production D1: autonomy control and watchdog, every
// supervised job with its pipeline stage (plan → code → package → candidate →
// CI → completion), the evolution ledger (repeated identical updates folded),
// cloud-bridge / GitHub Action relay dispatches and the last MEL WORK cycles.
// Nothing here starts or changes anything.

import { D1DevJobRepository, isPreparedDevBridgeJob } from '../dev/d1-dev-job-repository.js';
import { D1EvolutionLedger } from './evolution-ledger.js';
import { getAutonomyControl } from './autonomy-control.js';
import { readAutonomyProgressWatchdog } from './autonomy-progress-watchdog.js';
import { flattenRoadmap, isClosedRoadmapStatus } from '../roadmap/master-roadmap.js';


export const ACTIVITY_LIST_EPOCH_ID = 'activity-list-epoch';

export async function readActivityListEpoch(db, { strict = false } = {}) {
  if (!db?.prepare) return 0;
  try {
    const row = await db.prepare('SELECT last_seen FROM dev_bridge_state WHERE bridge_id=? LIMIT 1')
      .bind(ACTIVITY_LIST_EPOCH_ID).first();
    const epoch = Number(row?.last_seen || 0);
    return Number.isFinite(epoch) && epoch > 0 ? epoch : 0;
  } catch {
    if (strict) throw Object.assign(new Error('ACTIVITY_EPOCH_READ_FAILED'), { code: 'ACTIVITY_EPOCH_READ_FAILED' });
    return 0;
  }
}

/** Hide the activity list before this instant. Active supervised jobs are
 * cancelled so they cannot keep the queue. Rows stay in D1. */
export async function resetAutonomyActivityList(db, { now = Date.now() } = {}) {
  if (!db?.prepare) throw Object.assign(new Error('DB_BINDING_MISSING'), { code: 'DB_BINDING_MISSING' });
  const cancel = await db.prepare(`UPDATE dev_jobs SET status='CANCELLED', updated_at=?, error='ACTIVITY_LIST_RESET'
    WHERE status NOT IN ('COMPLETED','CANCELLED','FAILED')
    AND (requested_by='mel-autonomy' OR requested_by LIKE 'owner-chat%')`).bind(now).run();
  await db.prepare(`INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json)
    VALUES(?,?,?,?)
    ON CONFLICT(bridge_id) DO UPDATE SET last_seen=excluded.last_seen, status=excluded.status, metadata_json=excluded.metadata_json`)
    .bind(ACTIVITY_LIST_EPOCH_ID, now, 'RESET', JSON.stringify({ reason: 'owner-activity-list-reset', at: new Date(now).toISOString() }))
    .run();
  return {
    ok: true,
    epoch: now,
    cancelled_active: Number(cancel?.meta?.changes || 0),
    policy: 'hide-before-epoch-do-not-delete',
  };
}

function atOrAfter(value, epoch) {
  if (!epoch) return true;
  const n = typeof value === 'number' ? value : Date.parse(String(value || ''));
  return Number.isFinite(n) && n >= epoch;
}

const STATUS_TEXT = Object.freeze({
  QUEUED: 'En file : attend que le cycle minute le choisisse.',
  PLANNING: 'Plan en cours d’écriture par le conseil de modèles.',
  WAITING_TEACHER: 'Plan écrit, attend la validation (MAX la donne automatiquement).',
  TEACHER_APPROVED: 'Plan approuvé ; implémentation ou vérification du code à confirmer.',
  CLAIMED: 'Pris en charge : exécuteur et application sur la candidate à confirmer.',
  APPLIED: 'Appliqué sur la candidate ; tests en cours.',
  TESTING: 'Tests de la candidate en cours.',
  COMMITTED: 'Commit sur la candidate ; attend CI et promotion.',
  // COMPLETED means the code passed Council and CI, not that the roadmap
  // objective is proven; describeJob says which one applies.
  COMPLETED: 'Code livré (Council et CI) ; objectif de la feuille de route pas encore prouvé.',
  FAILED: 'Échec : voir l’erreur ; une réparation sera planifiée.',
  BLOCKED: 'Bloqué : voir la raison.',
  CANCELLED: 'Annulé.',
});

const STAGE_TEXT = Object.freeze({
  JOB_CREATED: 'Travail créé',
  JOB_UPDATED: 'Travail mis à jour',
  TEACHER_REVIEW: 'Revue du plan',
  BRIDGE_APPLIED: 'Appliqué par le pont',
  CI_PASSED: 'CI verte',
  CI_FAILED: 'CI en échec',
  PRODUCTION_VERIFIED: 'Production vérifiée',
  COMPLETED: 'Terminé',
});

const clip = (value, max = 240) => (value == null ? null : String(value).slice(0, max));
const num = value => (Number.isFinite(Number(value)) ? Number(value) : null);

function obj(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string') { try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; } }
  return {};
}

function currentTeacherReview(job) {
  const bridge = obj(job?.result_json?.teacher_bridge);
  const review = bridge.review;
  if (!review?.verdict) return null;
  if (bridge.request?.request_id && review.request_id && review.request_id !== bridge.request.request_id) return null;
  return review;
}

function diagnostic(value) {
  const d = obj(value);
  const code = d.code || d.status || d.reason || d.error || null;
  const codes = Array.isArray(d.mentor_failure_codes) ? d.mentor_failure_codes.map((row) => row?.code).filter(Boolean) : [];
  const text = [code, ...codes.filter((item) => item !== code), d.message || d.detail].filter(Boolean).join(' — ');
  if (!text) return null;
  return clip(text, 260);
}

/** The pipeline of one supervised job, as ordered steps with done/current/todo. */
function roadmapObjectiveProven(job) {
  const id = job?.optional_context?.roadmap_id;
  if (!id) return false;
  return isClosedRoadmapStatus(flattenRoadmap().find(item => item.id === id)?.status);
}

export function jobPipeline(job) {
  const status = String(job?.status || '').toUpperCase();
  const r = obj(job?.result_json);
  const review = currentTeacherReview(job) || {};
  const completion = r.autonomy_completion || {};
  const prep = r.bridge_preparation || {};
  const impl = r.implementation_proposal || {};
  const requestId = obj(r.teacher_bridge).request?.request_id || null;
  const teacher = obj(r.teacher_bridge);
  const planApproved = teacher.status === 'ANSWERED' && Boolean(requestId)
    && review.request_id === requestId && review.verdict === 'APPROVE_PLAN'
    && review.development_allowed === true;
  // An implementation proposal is a plan. Actual Mentor changes and test
  // commands are persisted only with the correlated structured Bridge package.
  const packageReady = planApproved && impl.status === 'READY'
    && impl.teacher_request_id === requestId
    && impl.candidate_sha === prep.candidate_sha
    && isPreparedDevBridgeJob({ ...job, status: 'TEACHER_APPROVED' });
  const sha = value => /^[a-f0-9]{40}$/i.test(String(value || ''));
  const ci = obj(completion.ci);
  const verified = planApproved && completion.status === 'VERIFIED'
    && completion.request_id === requestId && sha(completion.candidate_sha)
    && ci.verified === true && ci.workflow === 'full-candidate-ci'
    && ci.head_sha === completion.candidate_sha && ci.conclusion === 'success'
    && Number(ci.run_id) > 0;
  const existingVerified = verified && impl.decision === 'VERIFY_EXISTING';
  const bridge = obj(r.dev_bridge);
  const published = packageReady && bridge.mode === 'GITHUB_CLOUD_BRIDGE'
    && bridge.status === 'READY_FOR_REVIEW' && bridge.needs_repair === false
    && Number(bridge.github_run_id) > 0 && sha(bridge.candidate_sha);

  const steps = [
    { key: 'chosen', label: 'Chantier choisi', done: true },
    { key: 'plan', label: 'Plan validé' + (review.owner_override === true || r.owner_max_autonomy ? ' (par MAX)' : ''), done: planApproved },
    { key: 'code', label: existingVerified ? 'Code existant vérifié' : 'Code écrit', done: packageReady || existingVerified },
    { key: 'package', label: existingVerified ? 'Vérification sans nouveau paquet' : 'Paquet prêt pour le pont', done: packageReady || existingVerified },
    { key: 'candidate', label: 'Appliqué sur la candidate', done: published || verified },
    { key: 'ci', label: 'CI complète verte', done: verified },
    { key: 'done', label: 'Code livré (Council et CI)', done: status === 'COMPLETED' && verified },
    { key: 'objective', label: 'Objectif prouvé (feuille de route)', done: roadmapObjectiveProven(job) },
  ];
  const current = steps.findIndex(step => !step.done);
  return steps.map((step, index) => ({ ...step, state: step.done ? 'done' : index === current ? (status === 'FAILED' || status === 'BLOCKED' ? 'blocked' : 'current') : 'todo' }));
}

function bridgeDiagnostics(result) {
  const bridge = obj(result?.dev_bridge);
  const repair = obj(result?.repair_cycle);
  const retry = obj(result?.runtime_retry);
  const code = value => {
    const raw = String(value || '');
    return /^[A-Z][A-Z0-9_:-]{0,119}$/.test(raw) ? raw : null;
  };
  const runId = Number(bridge.github_run_id || bridge.result_json?.github_run_id || 0);
  const tests = Array.isArray(bridge.tests) ? bridge.tests.slice(0, 4).map(row => ({
    name: clip(row?.name, 100),
    passed: row?.passed === true,
    executed: row?.executed === true,
    exit_code: Number.isInteger(Number(row?.exit_code)) ? Number(row.exit_code) : null,
    error_code: code(row?.error),
  })) : [];
  return {
    github_run_id: Number.isSafeInteger(runId) && runId > 0 ? runId : null,
    mode: code(bridge.mode),
    status: code(bridge.status),
    needs_repair: bridge.needs_repair === true,
    tests,
    repair_source: code(repair.source),
    repair_attempts: Number.isSafeInteger(Number(repair.attempts)) ? Number(repair.attempts) : null,
    retry_error_code: code(retry.last_error),
  };
}

export function describeJob(job, now = Date.now()) {
  const r = obj(job?.result_json);
  const status = String(job?.status || 'UNKNOWN').toUpperCase();
  const review = currentTeacherReview(job) || {};
  const completion = r.autonomy_completion || {};
  const prep = r.bridge_preparation || {};
  const updated = num(job?.updated_at) || 0;
  return {
    id: clip(job?.id, 160),
    roadmap_id: job?.optional_context?.roadmap_id || null,
    requested_by: clip(job?.requested_by, 60),
    origin: String(job?.id || '').startsWith('ecosystem-watch-') ? 'veille des capacités'
      : String(job?.requested_by || '').startsWith('owner-chat') ? 'demande d’Adrien' : 'feuille de route',
    goal: clip(job?.goal, 600),
    status,
    status_text: status === 'COMPLETED' && roadmapObjectiveProven(job) ? 'Terminé : code livré et objectif prouvé.' : (STATUS_TEXT[status] || 'Statut ' + status + '.'),
    created_at: num(job?.created_at),
    updated_at: updated || null,
    idle_minutes: updated ? Math.max(0, Math.round((now - updated) / 60000)) : null,
    pipeline: jobPipeline(job),
    teacher: review.verdict ? { verdict: review.verdict, by_max: review.owner_override === true || Boolean(r.owner_max_autonomy), summary: clip(review.summary || review.reason, 300) } : null,
    files: Array.isArray(job?.files_json) ? job.files_json.slice(0, 10).map(f => clip(typeof f === 'string' ? f : f?.path, 160)) : [],
    tests: Array.isArray(job?.tests_json) ? job.tests_json.slice(0, 4).map(t => clip(typeof t === 'string' ? t : t?.path || t?.command, 160)) : [],
    candidate: prep.candidate_branch ? { branch: clip(prep.candidate_branch, 120), base_sha: clip(prep.candidate_sha, 40) } : null,
    completion: completion.status ? { status: clip(completion.status, 60), sha: clip(completion.candidate_sha, 40), ci_run_id: num(completion.ci?.run_id) } : null,
    bridge_diagnostics: bridgeDiagnostics(r),
    diagnostics: [diagnostic(r.implementation_planning_diagnostic), diagnostic(r.bridge_preparation_diagnostic)].filter(Boolean),
    error: clip(job?.error, 400),
  };
}

/** Ledger events, newest first, with consecutive identical updates folded into one row. */
export function foldLedger(events = [], limit = 40) {
  const out = [];
  for (const event of events) {
    const ev = obj(event?.evidence ?? event?.evidence_json);
    const row = {
      at: num(event?.occurred_at),
      evolution_id: clip(event?.evolution_id, 160),
      stage: clip(event?.stage, 60),
      stage_text: STAGE_TEXT[String(event?.stage || '')] || String(event?.stage || 'Événement'),
      status: clip(event?.status, 60),
      actor: clip(event?.actor, 60),
      detail: clip([
        ev.previous_status && ev.next_status && ev.previous_status !== ev.next_status ? ev.previous_status + ' → ' + ev.next_status : null,
        Array.isArray(ev.changed_fields) && ev.changed_fields.length ? 'champs : ' + ev.changed_fields.join(', ') : null,
        ev.bridge_status ? 'pont : ' + ev.bridge_status : null,
        ev.roadmap_id ? 'roadmap ' + ev.roadmap_id : null,
        ev.error ? 'erreur : ' + ev.error : null,
      ].filter(Boolean).join(' · '), 300),
      repeat: 1,
    };
    const last = out[out.length - 1];
    if (last && last.evolution_id === row.evolution_id && last.stage === row.stage && last.status === row.status && last.detail === row.detail) {
      last.repeat += 1;
      last.first_at = row.at;
      continue;
    }
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

async function rows(db, sql, ...binds) {
  try { return (await db.prepare(sql).bind(...binds).all())?.results || []; } catch { return []; }
}

// Evidence produced by the structured executor, not synthesized from job status.
// Exclude file bodies and redact sensitive command/output strings before exposure.
function safeExecutionText(value, limit = 4000) {
  return String(value ?? '').replace(/(Bearer\\s+)[^\\s]+/gi, '$1[MASQUÉ]')
    .replace(/(gh[pousr]_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9_]{12,})/g, '[MASQUÉ]')
    .replace(/((?:token|secret|password|authorization|api[_-]?key|cookie|credential)\\s*[:=]\\s*["']?)[^\\s,"'}]+/gi, '$1[MASQUÉ]')
    .slice(0, limit);
}
function executionEvidence(job) {
  const raw = obj(job?.result_json);
  const bridge = obj(raw.dev_bridge);
  const packageResult = obj(bridge.result_json || bridge);
  const steps = Array.isArray(packageResult.steps) ? packageResult.steps : [];
  const tests = Array.isArray(packageResult.tests) ? packageResult.tests : (Array.isArray(job?.tests_json) ? job.tests_json : []);
  const diff = packageResult.diff_summary || bridge.diff_summary;
  if (!steps.length && !tests.length && !diff) return null;
  return {
    job_id: String(job.id),
    updated_at: num(job.updated_at),
    steps: steps.slice(0, 30).map(row => ({
      capability: safeExecutionText(row.capability, 120),
      path: safeExecutionText(row.path, 300),
      passed: row.passed === true || row.applied === true,
      before: row.before ? { chars: Number(row.before.chars || 0), new_file: row.before.new_file === true } : null,
    })),
    tests: tests.slice(0, 12).map(row => ({
      command: safeExecutionText(row.command, 300),
      passed: row.passed === true,
      exit_code: Number.isFinite(Number(row.exit_code)) ? Number(row.exit_code) : null,
      stdout: safeExecutionText(row.stdout, 3000),
      stderr: safeExecutionText(row.stderr || row.error, 3000),
    })),
    diff: diff ? safeExecutionText(diff, 10000) : null,
  };
}
export async function buildAutonomyActivity(env, { now = Date.now(), limit = 30, repository = null } = {}) {
  const db = env?.DB;
  if (!db?.prepare) throw Object.assign(new Error('DB_BINDING_MISSING'), { status: 503 });
  const repo = repository || new D1DevJobRepository(db);
  const ledger = new D1EvolutionLedger(db);
  const [control, watchdog, allJobs, recentLedger, dispatches, relay, workCycles, executor] = await Promise.all([
    getAutonomyControl(db).catch(() => null),
    readAutonomyProgressWatchdog(db).catch(() => null),
    repo.list().catch(() => []),
    ledger.listRecent({ limit: 400 }).catch(() => []),
    rows(db, "SELECT bridge_id,status,last_seen,metadata_json FROM dev_bridge_state WHERE bridge_id LIKE 'cloud-bridge-dispatch:%' ORDER BY last_seen DESC LIMIT 10"),
    rows(db, 'SELECT id,status,workflow,result_json,error,created_at,updated_at FROM github_action_relay_jobs ORDER BY created_at DESC LIMIT 12'),
    rows(db, 'SELECT id,state,result,updated_at FROM mel_work_cycles ORDER BY updated_at DESC LIMIT 6'),
    db.prepare("SELECT last_seen,status FROM dev_bridge_state WHERE bridge_id='primary' LIMIT 1").first().catch(() => null),
  ]);
  const epoch = await readActivityListEpoch(db);
  const supervised = (Array.isArray(allJobs) ? allJobs : []).filter(job => {
    const by = String(job?.requested_by || '').toLowerCase();
    return (by === 'mel-autonomy' || by.startsWith('owner-chat')) && atOrAfter(job?.created_at, epoch);
  }).sort((a, b) => Number(b?.updated_at || 0) - Number(a?.updated_at || 0));
  const byStatus = {};
  for (const job of supervised) {
    const s = String(job?.status || 'UNKNOWN').toUpperCase();
    byStatus[s] = (byStatus[s] || 0) + 1;
  }
  // COMMITTED still awaits CI and promotion. Only genuinely terminal jobs leave active counts.
  const terminal = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
  const jobs = supervised.slice(0, Math.max(1, Math.min(60, limit))).map(job => describeJob(job, now));
  const executorAge = executor ? now - Number(executor.last_seen || 0) : null;
  return {
    ok: true,
    observed_at: new Date(now).toISOString(),
    source: 'production_d1',
    control: control ? {
      paused: control.paused === true,
      max_autonomy: control.max_autonomy === true,
      max_remembered: control.max_remembered === true,
      source: control.source || null,
      status: control.status || null,
      reason: control.reason || null,
      updated_at: control.updated_at || null,
      launch_approved_sha: control.launch_approved_sha || null,
    } : null,
    watchdog: watchdog || null,
    pc_executor: executor ? { online: executorAge >= 0 && executorAge < 60_000 && String(executor.status || '').toUpperCase() === 'ONLINE', last_seen: num(executor.last_seen) } : null,
    counts: {
      supervised_total: supervised.length,
      active: supervised.filter(job => !terminal.has(String(job?.status || '').toUpperCase())).length,
      by_status: byStatus,
    },
    jobs,
    execution_evidence: supervised.slice(0, Math.max(1, Math.min(60, limit))).map(executionEvidence).filter(Boolean),
    timeline: foldLedger(recentLedger.filter(event => atOrAfter(event?.occurred_at, epoch)), 40),
    activity_list_epoch: epoch || null,
    cloud_bridge_dispatches: dispatches.filter(row => atOrAfter(row.last_seen, epoch)).map(row => ({ job_id: String(row.bridge_id).slice('cloud-bridge-dispatch:'.length), status: row.status, at: num(row.last_seen), relay_job_id: obj(row.metadata_json).relay_job_id || null })),
    workflow_dispatches: relay.filter(row => atOrAfter(row.created_at, epoch)).map(row => {
      const result = obj(row.result_json);
      return { id: row.id, workflow: row.workflow, status: row.status, created_at: num(row.created_at), run_id: num(result.relay_run_id), error: clip(row.error, 200) };
    }),
    work_cycles: workCycles.filter(row => atOrAfter(row.updated_at, epoch)).map(row => {
      const result = obj(row.result);
      return { at: row.updated_at, state: row.state, status: result.status || row.state, mission: clip(result.mission?.title || result.mission_title || result.task_id, 140), submission: result.submission || null };
    }),
  };
}

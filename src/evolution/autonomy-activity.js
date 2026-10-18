// Detailed, read-only view of what MEL is doing, for the « Activité » panel.
//
// Everything comes from production D1: autonomy control and watchdog, every
// supervised job with its pipeline stage (plan → code → package → candidate →
// CI → completion), the evolution ledger (repeated identical updates folded),
// cloud-bridge / GitHub Action relay dispatches and the last MEL WORK cycles.
// Nothing here starts or changes anything.

import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import { D1EvolutionLedger } from './evolution-ledger.js';
import { getAutonomyControl } from './autonomy-control.js';
import { readAutonomyProgressWatchdog } from './autonomy-progress-watchdog.js';

const STATUS_TEXT = Object.freeze({
  QUEUED: 'En file : attend que le cycle minute le choisisse.',
  PLANNING: 'Plan en cours d’écriture par le conseil de modèles.',
  WAITING_TEACHER: 'Plan écrit, attend la validation (MAX la donne automatiquement).',
  TEACHER_APPROVED: 'Plan validé ; code écrit puis paquet préparé pour le pont cloud.',
  CLAIMED: 'Pris par le pont cloud : application sur la branche candidate.',
  APPLIED: 'Appliqué sur la candidate ; tests en cours.',
  TESTING: 'Tests de la candidate en cours.',
  COMMITTED: 'Commit sur la candidate ; attend CI et promotion.',
  COMPLETED: 'Terminé et vérifié.',
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

function diagnostic(value) {
  const d = obj(value);
  const code = d.code || d.status || d.reason || d.error || null;
  if (!code && !d.message && !d.detail) return null;
  return clip([code, d.message || d.detail].filter(Boolean).join(' — '), 260);
}

/** The pipeline of one supervised job, as ordered steps with done/current/todo. */
export function jobPipeline(job) {
  const status = String(job?.status || '').toUpperCase();
  const r = obj(job?.result_json);
  const review = r.teacher_bridge?.review || r.last_teacher_review || {};
  const completion = r.autonomy_completion || {};
  const prep = r.bridge_preparation || {};
  const impl = r.implementation_proposal || {};
  const steps = [
    { key: 'chosen', label: 'Chantier choisi', done: true },
    { key: 'plan', label: 'Plan validé' + (review.owner_override === true || r.owner_max_autonomy ? ' (par MAX)' : ''), done: review.verdict === 'APPROVE_PLAN' || ['TEACHER_APPROVED', 'CLAIMED', 'APPLIED', 'TESTING', 'COMMITTED', 'COMPLETED'].includes(status) },
    { key: 'code', label: 'Code écrit', done: String(impl.status || '').toUpperCase() === 'READY' || ['CLAIMED', 'APPLIED', 'TESTING', 'COMMITTED', 'COMPLETED'].includes(status) },
    { key: 'package', label: 'Paquet prêt pour le pont', done: String(prep.status || '').toUpperCase() === 'READY' || ['CLAIMED', 'APPLIED', 'TESTING', 'COMMITTED', 'COMPLETED'].includes(status) },
    { key: 'candidate', label: 'Appliqué sur la candidate', done: Boolean(completion.candidate_sha) || ['APPLIED', 'TESTING', 'COMMITTED', 'COMPLETED'].includes(status) },
    { key: 'ci', label: 'CI complète verte', done: String(completion.ci?.conclusion || completion.ci?.status || '').toLowerCase() === 'success' || status === 'COMPLETED' },
    { key: 'done', label: 'Terminé (promotion puis release automatiques)', done: status === 'COMPLETED' },
  ];
  const current = steps.findIndex(step => !step.done);
  return steps.map((step, index) => ({ ...step, state: step.done ? 'done' : index === current ? (status === 'FAILED' || status === 'BLOCKED' ? 'blocked' : 'current') : 'todo' }));
}

export function describeJob(job, now = Date.now()) {
  const r = obj(job?.result_json);
  const status = String(job?.status || 'UNKNOWN').toUpperCase();
  const review = r.teacher_bridge?.review || r.last_teacher_review || {};
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
    status_text: STATUS_TEXT[status] || 'Statut ' + status + '.',
    created_at: num(job?.created_at),
    updated_at: updated || null,
    idle_minutes: updated ? Math.max(0, Math.round((now - updated) / 60000)) : null,
    pipeline: jobPipeline(job),
    teacher: review.verdict ? { verdict: review.verdict, by_max: review.owner_override === true || Boolean(r.owner_max_autonomy), summary: clip(review.summary || review.reason, 300) } : null,
    files: Array.isArray(job?.files_json) ? job.files_json.slice(0, 10).map(f => clip(typeof f === 'string' ? f : f?.path, 160)) : [],
    tests: Array.isArray(job?.tests_json) ? job.tests_json.slice(0, 4).map(t => clip(typeof t === 'string' ? t : t?.path || t?.command, 160)) : [],
    candidate: prep.candidate_branch ? { branch: clip(prep.candidate_branch, 120), base_sha: clip(prep.candidate_sha, 40) } : null,
    completion: completion.status ? { status: clip(completion.status, 60), sha: clip(completion.candidate_sha, 40), ci_run_id: num(completion.ci?.run_id) } : null,
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
  const supervised = (Array.isArray(allJobs) ? allJobs : []).filter(job => {
    const by = String(job?.requested_by || '').toLowerCase();
    return by === 'mel-autonomy' || by.startsWith('owner-chat');
  }).sort((a, b) => Number(b?.updated_at || 0) - Number(a?.updated_at || 0));
  const byStatus = {};
  for (const job of supervised) {
    const s = String(job?.status || 'UNKNOWN').toUpperCase();
    byStatus[s] = (byStatus[s] || 0) + 1;
  }
  const terminal = new Set(['COMPLETED', 'COMMITTED', 'FAILED', 'CANCELLED']);
  // Keep actionable jobs visible even when many recent terminal records exist.
  // Terminal rows stay in D1 and remain readable as history.
  const orderedJobs = [
    ...supervised.filter(job => !terminal.has(String(job?.status || '').toUpperCase())),
    ...supervised.filter(job => terminal.has(String(job?.status || '').toUpperCase())),
  ];
  const jobs = orderedJobs.slice(0, Math.max(1, Math.min(60, limit))).map(job => describeJob(job, now));
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
    timeline: foldLedger(recentLedger, 40),
    cloud_bridge_dispatches: dispatches.map(row => ({ job_id: String(row.bridge_id).slice('cloud-bridge-dispatch:'.length), status: row.status, at: num(row.last_seen), relay_job_id: obj(row.metadata_json).relay_job_id || null })),
    workflow_dispatches: relay.map(row => {
      const result = obj(row.result_json);
      return { id: row.id, workflow: row.workflow, status: row.status, created_at: num(row.created_at), run_id: num(result.relay_run_id), error: clip(row.error, 200) };
    }),
    work_cycles: workCycles.map(row => {
      const result = obj(row.result);
      return { at: row.updated_at, state: row.state, status: result.status || row.state, mission: clip(result.mission?.title || result.mission_title || result.task_id, 140), submission: result.submission || null };
    }),
  };
}

import { isAcceptedRuntimeRecertificationJob, withRuntimeRecertification } from '../roadmap/runtime-recertification.js';
import { computeRoadmapTruth } from '../roadmap/roadmap-truth.js';
import { isAcceptedRoadmapCodeJob } from '../roadmap/roadmap-code-acceptance.js';
import { singleFlightAutonomyMission } from './provider-exhaustion-rotation.js';
import { unmetSoftwarePrerequisites } from './own-roadmap-advance.js';
import { jobActivityTimestamp } from './autonomy-job-epoch.js';
// Detailed, read-only view of what MEL is doing, for the « Activité » panel.
//
// Everything comes from production D1: autonomy control and watchdog, every
// supervised job with its pipeline stage (plan → code → package → candidate →
// CI → completion), the evolution ledger (repeated identical updates folded),
// cloud-bridge / GitHub Action relay dispatches and the last MEL WORK cycles.
// Nothing here starts or changes anything.

import { mentorMetrics, pipelineAlerts } from './autonomy-metrics.js';
import { D1DevJobRepository, isPreparedDevBridgeJob } from '../dev/d1-dev-job-repository.js';
import { D1EvolutionLedger } from './evolution-ledger.js';
import { getAutonomyControl, isLegacyOwnerMaxStop } from './autonomy-control.js';
import { readAutonomyProgressWatchdog } from './autonomy-progress-watchdog.js';
import { readSurvivalState } from '../legacy/survival-mode.js';
import { flattenRoadmap, isClosedRoadmapStatus } from '../roadmap/master-roadmap.js';
import { selectNextAutonomyItem, listAutonomySchedulerJobs } from './autonomy-supervisor.js';
import { localPcModelReady } from '../models/local-pc-model.js';


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
    WHERE status NOT IN ('COMPLETED','DONE','DONE_VERIFIED','VERIFIED','ACCEPTED','CANCELLED','FAILED')
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
  WAITING_DEPENDENCY: 'En attente passive de prérequis vérifiables : aucun appel IA.',
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
// MAX never edits the static roadmap declaration (by design), so the declared
// status alone never proved a delivery: FOUNDER-04, completed with a verified
// acceptance receipt on 30/10, never showed « Objectif prouvé ».
function roadmapObjectiveProven(job) {
  const id = job?.optional_context?.roadmap_id;
  if (!id) return false;
  if (job?.optional_context?.work_mode === 'VERIFY_RUNTIME') return isAcceptedRuntimeRecertificationJob(job);
  return isAcceptedRoadmapCodeJob({ ...job, files_json: Array.isArray(job?.files_json) ? job.files_json : [], optional_context: job.optional_context, result_json: obj(job?.result_json) })
    || isClosedRoadmapStatus(flattenRoadmap().find(item => item.id === id)?.status);
}

export function jobPipeline(job) {
  const status = String(job?.status || '').toUpperCase();
  const r = obj(job?.result_json);
  if (job?.optional_context?.work_mode === 'VERIFY_RUNTIME') {
    const verified = isAcceptedRuntimeRecertificationJob({ ...job, result_json: r });
    return [
      { key: 'chosen', label: 'Recette logicielle sélectionnée', done: true, state: 'done' },
      { key: 'runtime-proof', label: 'Exécution et reçu runtime audité', done: verified,
        state: verified ? 'done' : status === 'FAILED' ? 'blocked' : 'current' },
    ];
  }
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
  if (impl.status === 'VERIFY_EXISTING' || r.verify_existing?.status) {
    const evidence = obj(r.verify_existing), verdict = obj(r.council_review);
    const rejected = verdict.decision === 'REJECTED';
    const steps = [
      { key: 'chosen', label: 'Chantier choisi', done: true },
      { key: 'plan', label: 'Plan approuvé par le Teacher', done: planApproved },
      { key: 'ci', label: 'CI exacte reçue', done: Number(evidence.ci_run_id) > 0 && evidence.candidate_sha === impl.candidate_sha },
      { key: 'live', label: 'Résultats fonctionnels reçus', done: Array.isArray(evidence.live_checks) && evidence.live_checks.length > 0
        && ['COUNCIL_REVIEWED','COUNCIL_APPROVED','VERIFIED'].includes(evidence.status) },
      { key: 'council', label: 'Preuves validées par le Council', done: verdict.decision === 'APPROVED' || existingVerified },
      { key: 'objective', label: 'Objectif prouvé (feuille de route)', done: roadmapObjectiveProven(job) },
    ];
    const current = steps.findIndex(step => !step.done);
    return steps.map((step, index) => ({ ...step, state: step.done ? 'done'
      : (step.key === 'council' && rejected) || (index === current && ['FAILED','BLOCKED'].includes(status)) ? 'blocked'
        : index === current ? 'current' : 'todo' }));
  }

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

// One line per pipeline step, each tied to the exact run or SHA that proves
// it, so a mission can be followed from package to promotion without D1.
export function jobTrace(result) {
  const r = obj(result);
  const sha = value => (/^[a-f0-9]{40}$/i.test(String(value || '')) ? String(value).toLowerCase() : null);
  const runId = value => (Number(value) > 0 ? Number(value) : null);
  const bridge = obj(r.dev_bridge);
  const ci = obj(obj(r.autonomy_completion).ci);
  const council = obj(r.council_review);
  return [
    runId(bridge.github_run_id) && { step: 'bridge', run_id: runId(bridge.github_run_id), sha: sha(bridge.candidate_sha), status: clip(bridge.status, 40) },
    runId(ci.run_id) && { step: 'ci', run_id: runId(ci.run_id), sha: sha(ci.head_sha), status: clip(ci.conclusion, 40) },
    council.decision && { step: 'council', sha: sha(council.head), status: clip(council.decision, 40) },
  ].filter(Boolean);
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
    status_text: job?.optional_context?.work_mode === 'VERIFY_RUNTIME'
      ? (isAcceptedRuntimeRecertificationJob({ ...job, result_json: r }) ? 'Recette logicielle validée avec reçu runtime récent.'
        : status === 'FAILED' ? 'Recette non validée : voir le diagnostic.' : 'Recertification logicielle en attente ou en cours.')
      : r.council_review?.decision === 'REJECTED' && r.council_review?.mode === 'VERIFY_EXISTING'
        ? 'Vérification refusée par le Council : preuves ou comportement à corriger.'
      : status === 'COMPLETED' && roadmapObjectiveProven(job) ? 'Terminé : code livré et objectif prouvé.' : (STATUS_TEXT[status] || 'Statut ' + status + '.'),
    created_at: num(job?.created_at),
    updated_at: updated || null,
    idle_minutes: updated ? Math.max(0, Math.round((now - updated) / 60000)) : null,
    pipeline: jobPipeline(job),
    teacher: review.verdict ? { verdict: review.verdict, by_max: review.owner_override === true || Boolean(r.owner_max_autonomy), summary: clip(review.summary || review.reason, 300) } : null,
    files: Array.isArray(job?.files_json) ? job.files_json.slice(0, 10).map(f => clip(typeof f === 'string' ? f : f?.path, 160)) : [],
    tests: Array.isArray(job?.tests_json) ? job.tests_json.slice(0, 4).map(t => clip(typeof t === 'string' ? t : t?.path || t?.command, 160)) : [],
    candidate: prep.candidate_branch ? { branch: clip(prep.candidate_branch, 120), base_sha: clip(prep.candidate_sha, 40) } : null,
    completion: completion.status ? { status: clip(completion.status, 60), sha: clip(completion.candidate_sha, 40), ci_run_id: num(completion.ci?.run_id) } : null,
    trace: jobTrace(r),
    bridge_diagnostics: bridgeDiagnostics(r),
    diagnostics: (r.implementation_proposal?.status === 'VERIFY_EXISTING' || r.verify_existing?.status
      ? [diagnostic(r.verify_existing)]
      : [diagnostic(r.implementation_planning_diagnostic), diagnostic(r.bridge_preparation_diagnostic)]).filter(Boolean),
    error: clip(job?.error, 400),
  };
}

/** Ledger events, newest first, with consecutive identical updates folded into one row. */
export function foldLedger(events = [], limit = 40) {
  const out = [];
  for (const event of events) {
    const ev = obj(event?.evidence ?? event?.evidence_json);
    const ledgerDrill = event?.actor === 'release-bootstrap' && ev.roadmap_id === 'MEL-EVOL-04'
      && /^[a-f0-9]{40}$/.test(String(event?.source_sha || ''))
      && event.evolution_id === 'release-proof-' + event.source_sha.slice(0, 12);
    const drillText = ledgerDrill ? {
      JOB_CREATED: 'Contrôle du journal de déploiement démarré',
      PRODUCTION_VERIFIED: 'Journal du déploiement vérifié',
    }[String(event?.stage || '')] : null;
    const row = {
      at: num(event?.occurred_at),
      evolution_id: clip(event?.evolution_id, 160),
      stage: clip(event?.stage, 60),
      stage_text: drillText || STAGE_TEXT[String(event?.stage || '')] || String(event?.stage || 'Événement'),
      status: clip(event?.status, 60),
      actor: clip(event?.actor, 60),
      detail: clip([
        ev.previous_status && ev.next_status && ev.previous_status !== ev.next_status ? ev.previous_status + ' → ' + ev.next_status : null,
        Array.isArray(ev.changed_fields) && ev.changed_fields.length ? 'champs : ' + ev.changed_fields.join(', ') : null,
        ev.bridge_status ? 'pont : ' + ev.bridge_status : null,
        ledgerDrill ? 'Contrôle de release · aucune mission MAX relancée' : ev.roadmap_id ? 'roadmap ' + ev.roadmap_id : null,
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
// Next run of each Worker cron (wrangler.jsonc): every minute drives MAX,
// :17 hourly and 02:43 daily run the scheduled maintenance passes.
export function scheduledCycles(now = Date.now()) {
  const minute = Math.floor(now / 60000) * 60000 + 60000;
  const hourly = new Date(now); hourly.setUTCMinutes(17, 0, 0); if (hourly.getTime() <= now) hourly.setUTCHours(hourly.getUTCHours() + 1);
  const daily = new Date(now); daily.setUTCHours(2, 43, 0, 0); if (daily.getTime() <= now) daily.setUTCDate(daily.getUTCDate() + 1);
  return [
    { label: 'Cycle MAX', cron: '* * * * *', next_at: minute },
    { label: 'Passage horaire', cron: '17 * * * *', next_at: hourly.getTime() },
    { label: 'Maintenance quotidienne', cron: '43 2 * * *', next_at: daily.getTime() },
  ];
}

// Read-only roadmap catalog. A declared objective is NOT a D1 job and never
// reserves MAX's single-flight slot or triggers a model call.
export function buildPassiveRoadmapCatalog(roadmap = flattenRoadmap(), jobs = [], { acceptanceJobs = [], truth = null } = {}) {
  const rows = Array.isArray(roadmap) ? roadmap : [];
  const acceptedCodeIds = [...jobs, ...acceptanceJobs].filter(isAcceptedRoadmapCodeJob).map(job => job.optional_context.roadmap_id);
  const executionRows = truth?.available === true ? withRuntimeRecertification(rows, truth, {acceptedCodeIds}) : rows;
  const visibleRows = executionRows.filter(row => row.proof_recipe_only !== true);
  const recipeByTarget = new Map(executionRows.filter(row => row.proof_recipe_only === true).map(row => [row.verification_target_id, row]));
  const verifiedIds = new Set(rows.filter(row => truth ? truth.available === true && truth.items?.[row.id]?.truth === 'VERIFIED_LIVE'
    : isClosedRoadmapStatus(row?.status)).map(row => row.id));
  const softwareVerifiedIds = new Set(verifiedIds);
  for (const job of [...jobs, ...acceptanceJobs]) {
    const acceptedId = job?.optional_context?.roadmap_id;
    if (acceptedId && isAcceptedRoadmapCodeJob(job)
        && !rows.some(row => row.id === acceptedId && String(row.status || '').toUpperCase() === 'REGRESSED')) {
      softwareVerifiedIds.add(acceptedId);
      if (!truth) verifiedIds.add(acceptedId);
    }
  }
  const latestJobs = new Map();
  for (const job of jobs) {
    const id = job?.optional_context?.roadmap_id || job?.roadmap_id;
    if (!id) continue;
    const previous = latestJobs.get(id);
    if (!previous || Number(job.updated_at || 0) > Number(previous.updated_at || 0)) latestJobs.set(id, job);
  }
  // A code-delivered objective is closed only by a verified acceptance receipt,
  // not by merely completing a job. Explicitly REGRESSED objectives reopen.
  const isProven = row => row?.id && String(row.status || '').toUpperCase() !== 'REGRESSED'
    && verifiedIds.has(row.id);
  const items = visibleRows.filter(row => row?.id && !isProven(row)).map(row => {
    const recipe = recipeByTarget.get(row.id);
    const mission = latestJobs.get(row.id) || latestJobs.get(recipe?.id) || null;
    const missionStatus = mission ? String(mission.status || 'UNKNOWN').toUpperCase() : null;
    const blockers = unmetSoftwarePrerequisites(row, executionRows, [...softwareVerifiedIds]);
    const status = String(row.status || 'PLANNED').toUpperCase();
    const external = status === 'BLOCKED_HUMAN' || status === 'BLOCKED_EXTERNAL';
    const missionOpen = mission && !['COMPLETED','FAILED','CANCELLED','DONE','DONE_VERIFIED','VERIFIED','ACCEPTED'].includes(missionStatus);
    const state = truth && truth.available !== true ? 'PROOF_STATUS_UNAVAILABLE'
      : missionOpen ? 'MISSION_REGISTERED'
      : recipe ? 'PROOF_RECIPE_REQUIRED'
      : row.mode === 'VERIFY_RUNTIME' ? 'READY_FOR_RUNTIME_VERIFICATION'
      : external ? status
      : blockers.length ? 'WAITING_PREREQUISITES'
      : missionStatus === 'COMPLETED' ? 'CODE_DELIVERED_UNVERIFIED'
      : 'ROADMAP_DEFINED';
    return {
      id: row.id, title: row.title || row.id, phase: row.phase || null,
      priority: row.priority || null, status, state,
      mission_id: mission?.id || null, mission_status: missionStatus,
      contract_defined: Boolean(row.contract_revision && row.code_paths?.length && row.test_paths?.length),
      depends_on: Array.isArray(row.depends_on) ? row.depends_on : [],
      unmet_prerequisites: blockers,
      proof_recipe_mission: recipe ? { id: recipe.id, mode: recipe.mode,
        code_paths: recipe.code_paths, test_paths: recipe.test_paths,
        depends_on: recipe.depends_on, certifies_parent: false } : null,
    };
  });
  return { total: visibleRows.length, verified: visibleRows.filter(isProven).length,
    verification_source: truth ? truth.available === true ? 'production_d1_audit' : 'UNAVAILABLE' : 'historical_registry',
    proof_recipe_tasks: recipeByTarget.size,
    remaining: items.length, items };
}

// The legacy owner-ui MAX-off representation has paused=false. It must not
// render a running mission until the owner explicitly resumes autonomy.
export function visibleActiveAutonomyMission(holder, control) {
  if (!holder) return null;
  // If the system is paused, never show an active mission.
  if (control?.paused === true) return null;
  // Legacy owner‑MAX stop hides missions except when the mission is already
  // committed (the owner cannot retroactively cancel a committed supervised job).
  if (isLegacyOwnerMaxStop(control)) {
    const status = String(holder.status || '').toUpperCase();
    if (status !== 'COMMITTED') return null;
  }
  // Terminal statuses describe historical jobs, never a mission executing now.
  // COMMITTED remains visible as release/runtime verification is still pending.
  const status = String(holder.status || '').toUpperCase();
  if (new Set(['QUEUED', 'COMPLETED', 'FAILED', 'CANCELLED']).has(status)) return null;
  return holder;
}

// The plan shown in the Code chat: the mission in progress with its steps,
// the roadmap items that come next, and when the next cycles are scheduled.
export function buildCodePlan(jobs = [], { roadmap = flattenRoadmap(), now = Date.now(), limit = 3, verifiedIds = [], verifiedRuntimeIds = [] } = {}) {
  const terminal = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
  const acceptedIds = verifiedIds.filter(id => !roadmap.some(row => row.id === id && String(row.status || '').toUpperCase() === 'REGRESSED'));
  const completedIds = acceptedIds.filter(id => !roadmap.some(row => row.id === id && row.recertification_only === true)
    || verifiedRuntimeIds.includes(id));
  const active = jobs.filter(job => job?.roadmap_id && !completedIds.includes(job.roadmap_id) && !terminal.has(String(job.status || '').toUpperCase()));
  const current = active.find(job => job.queue_state === 'ACTIVE')
    || active.find(job => job.queue_state === undefined && String(job.status || '').toUpperCase() !== 'WAITING_DEPENDENCY') || null;
  const excluded = active.map(job => job.roadmap_id);
  const next = [];
  while (next.length < limit) {
    const item = selectNextAutonomyItem({ roadmap, completedIds, verifiedIds: acceptedIds, blockedIds: [...excluded, ...next.map(row => row.id)], quickWinsFirst: true });
    if (!item) break;
    next.push({ id: item.id, title: clip(item.title, 140), status: item.status });
  }
  return {
    current: current ? { roadmap_id: current.roadmap_id, status: current.status, goal: clip(String(current.goal || '').replace(/\s*\|\s*OBJECTIF\s[\s\S]*$/, ''), 200), steps: current.pipeline || [] } : null,
    queued: active.filter(job => job !== current).slice(0, limit).map(job => ({ roadmap_id: job.roadmap_id, status: job.status })),
    next,
    schedule: scheduledCycles(now),
  };
}

export async function buildAutonomyActivity(env, { now = Date.now(), limit = 30, repository = null } = {}) {
  const db = env?.DB;
  if (!db?.prepare) throw Object.assign(new Error('DB_BINDING_MISSING'), { status: 503 });
  const repo = repository || new D1DevJobRepository(db);
  const ledger = new D1EvolutionLedger(db);
  const roadmap = flattenRoadmap();
  const [control, watchdog, allJobs, recentLedger, dispatches, relay, workCycles, executor, coder, truth] = await Promise.all([
    getAutonomyControl(db).catch(() => null),
    readAutonomyProgressWatchdog(db).catch(() => null),
    listAutonomySchedulerJobs(repo).catch(() => []),
    ledger.listRecent({ limit: 400 }).catch(() => []),
    rows(db, "SELECT bridge_id,status,last_seen,metadata_json FROM dev_bridge_state WHERE bridge_id LIKE 'cloud-bridge-dispatch:%' ORDER BY last_seen DESC LIMIT 10"),
    rows(db, 'SELECT id,status,workflow,result_json,error,created_at,updated_at FROM github_action_relay_jobs ORDER BY created_at DESC LIMIT 12'),
    rows(db, 'SELECT id,state,result,updated_at FROM mel_work_cycles ORDER BY updated_at DESC LIMIT 6'),
    db.prepare("SELECT last_seen,status FROM dev_bridge_state WHERE bridge_id='primary' LIMIT 1").first().catch(() => null),
    localPcModelReady(env, now).catch(() => ({ ok: false, code: 'LOCAL_CHECK_FAILED' })),
    computeRoadmapTruth(db, [{items:roadmap}], {now}).catch(() => ({ available: false })),
  ]);
  const epoch = await readActivityListEpoch(db);
  const supervised = (Array.isArray(allJobs) ? allJobs : []).filter(job => {
    const by = String(job?.requested_by || '').toLowerCase();
    return (by === 'mel-autonomy' || by.startsWith('owner-chat')) && atOrAfter(jobActivityTimestamp(job), epoch);
  }).sort((a, b) => Number(b?.updated_at || 0) - Number(a?.updated_at || 0));
  // COMMITTED still awaits CI and promotion. Only genuinely terminal jobs leave active counts.
  const terminal = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'DONE', 'DONE_VERIFIED', 'VERIFIED', 'ACCEPTED']);
  // Display one entry per persisted mission, regardless of repeated snapshots.
  const unique = [...new Map(supervised.map(job => [String(job.id), job])).values()];
  // Counts must describe the same deduplicated snapshot that the UI renders.
  const uniqueByStatus = {};
  for (const job of unique) {
    const status = String(job.status || 'UNKNOWN').toUpperCase();
    uniqueByStatus[status] = (uniqueByStatus[status] || 0) + 1;
  }
  // A mission remains current while Teacher/CI is pending. Those are stages
  // of its lifecycle, not permission for a passive queue entry to advance.
  // A fresh QUEUED record alone still proves no execution.
  const holder = singleFlightAutonomyMission(unique);
  const activeMission = visibleActiveAutonomyMission(holder, control);
  const pending = unique.filter(job => !terminal.has(String(job?.status || '').toUpperCase()) && job.id !== activeMission?.id);
  const reportJobs = unique.slice().sort((a,b)=>Number(b.id===activeMission?.id)-Number(a.id===activeMission?.id));
  const jobs = reportJobs.filter(job => !terminal.has(String(job.status || '').toUpperCase())).concat(reportJobs.filter(job => terminal.has(String(job.status || '').toUpperCase())).slice(0, Math.max(1, Math.min(60, limit)))).map(job => ({ ...describeJob(job, now), queue_state: terminal.has(String(job.status).toUpperCase()) ? 'TERMINAL' : job.id === activeMission?.id ? 'ACTIVE' : 'WAITING', priority_penalty: Number(job.result_json?.autonomy_deferral?.priority_penalty || (job.result_json?.autonomy_deferral?.exhausted ? 1 : 0)) }));
  const mentor = mentorMetrics(supervised);
  const executorAge = executor ? now - Number(executor.last_seen || 0) : null;
  const acceptedCodeIds = allJobs.filter(isAcceptedRoadmapCodeJob).map(job => job.optional_context.roadmap_id);
  const verifiedRuntimeIds = allJobs.filter(job => isAcceptedRuntimeRecertificationJob(job, {now})).map(job => job.optional_context.roadmap_id);
  const executionRoadmap = withRuntimeRecertification(roadmap, truth, {acceptedCodeIds});
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
    execution_policy: {
      required_path: 'cloud',
      companion: 'bonus',
      companion_tasks: (executor && executorAge >= 0 && executorAge < 60_000 && String(executor.status || '').toUpperCase() === 'ONLINE') || coder?.ok === true ? 'active' : 'set_aside',
      companion_proofs: coder?.ok === true ? 'available' : 'set_aside',
      blocks_progress: false,
    },
    pc_executor: {
      online: executor ? executorAge >= 0 && executorAge < 60_000 && String(executor.status || '').toUpperCase() === 'ONLINE' : false,
      last_seen: executor ? num(executor.last_seen) : null,
      local_coder: coder?.ok === true,
      local_coder_reason: coder?.ok === true ? null : (coder?.code || null),
      required: false,
      role: 'bonus',
      blocks_cloud: false,
      proofs: coder?.ok === true ? 'available' : 'set_aside',
    },
    scheduler_slot: holder ? {
      reserved: true, mission_id: holder.id,
      roadmap_id: holder.optional_context?.roadmap_id || null,
      status: String(holder.status || 'UNKNOWN').toUpperCase(),
      executing: activeMission?.id === holder.id,
      reason: String(holder.status || '').toUpperCase() === 'QUEUED'
        ? 'QUEUED_RESERVES_SINGLE_FLIGHT' : 'MISSION_IN_DELIVERY_LIFECYCLE',
    } : { reserved: false, mission_id: null, roadmap_id: null, executing: false, reason: null },
    counts: {
      supervised_total: unique.length,
      active: activeMission ? 1 : 0,
      waiting: pending.length,
      by_status: uniqueByStatus,
    },
    jobs,
    passive_roadmap: buildPassiveRoadmapCatalog(roadmap, unique, { acceptanceJobs: allJobs, truth }),
    plan: buildCodePlan(jobs, { now, roadmap: executionRoadmap,
      verifiedIds: [...new Set([...acceptedCodeIds, ...verifiedRuntimeIds])], verifiedRuntimeIds }),
    metrics: { mentor, alerts: pipelineAlerts(supervised, mentor, { now }) },
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
    survival: await readSurvivalState(db, { now }).catch(() => ({ active: false, status: 'UNKNOWN' })),
  };
}

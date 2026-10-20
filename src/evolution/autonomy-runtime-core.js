import { createRuntimeEvolutionLoader } from '../roadmap/evolution-storage.js';
import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import { AutonomySupervisor } from './autonomy-supervisor.js';
import { prepareDevelopmentRequest } from './development-preflight.js';
import { createGitHubCodeReader } from '../capabilities/github-code-capabilities.js';
import { createTeacherReviewRequest } from '../teachers/teacher-request.js';
import { queueRuntimeTeacherRequest } from '../teachers/runtime-teacher-bridge.js';
import { mirrorRuntimeTeacherRequestToGitHub } from '../teachers/github-request-mirror.js';
import { reconcileRuntimeTeacherReplies } from '../teachers/github-reply-reconciler.js';
import { reconcileRuntimeCompletions } from '../teachers/github-completion-reconciler.js';
import { runRuntimeWorkDagResumeProof } from './autonomy-proof.js';
import { prepareApprovedImplementationProposal } from './autonomy-implementation-planner.js';
import { prepareApprovedBridgePackage } from './autonomy-bridge-preparer.js';
import { droppedTeacherApproval } from '../teachers/owner-max-approval.js';
import { readActivityListEpoch } from './autonomy-activity.js';

// Bound active reconciliation/sweeps to the same activity generation as the
// scheduler. The underlying repository still retains its complete journal.
export function currentAutonomyRepository(repository, epochMs = 0) {
  const epoch = Math.max(0, Number(epochMs) || 0);
  return new Proxy(repository, {
    get(target, key) {
      if (key === 'list') return async () => (await target.list()).filter(job =>
        (!epoch || Number(job?.created_at || 0) >= epoch)
        && String(job?.status || '').toUpperCase() !== 'CANCELLED');
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

const USEFUL_AUTONOMY_EVENTS = new Set([
  'JOB_COMPLETED',
  'JOB_STATE_ADVANCED',
  'IMPLEMENTATION_PREPARED',
  'BRIDGE_PACKAGE_PREPARED',
  'ROADMAP_COMPLETION_ADVANCED',
  'COMPLETION_REJECTED_AND_DIAGNOSED',
]);

export function autonomyTickAdvanced(events) {
  return (Array.isArray(events) ? events : []).some(event => USEFUL_AUTONOMY_EVENTS.has(event));
}

const INSPECTION_FILES = [
  'AUTONOMY_STATE.json',
  'TEACHER_BRIDGE.md',
  'src/roadmap/master-roadmap.js',
  'src/evolution/autonomy-supervisor.js',
  'src/evolution/autonomy-proof.js',
  'src/evolution/autonomy-implementation-planner.js',
  'src/evolution/autonomy-bridge-preparer.js',
  'src/dev/runtime-api.js',
  'src/dev/bridge-job-runner.js',
  'src/work/work-dag.js',
  'src/work/autonomous-work-loop.js',
  'src/teachers/runtime-teacher-bridge.js',
  'src/teachers/github-completion-reconciler.js',
];

export const MAX_OWNER_MAX_REPAIR_ATTEMPTS = 8;

export function failureSignature(tests = []) {
  return (Array.isArray(tests) ? tests : [])
    .filter((row) => row && row.passed !== true)
    .map((row) => String(row.error || row.stderr || '').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 500);
}

// A failure the mentor has not been shown is not an exhausted attempt.
// Identical repeats still stop at the cap. Distinct texts stop at the cap too.
export function repairBudgetDecision({ attempts = 0, maxAttempts = MAX_OWNER_MAX_REPAIR_ATTEMPTS, failedTests = [], presentedSignatures = [] } = {}) {
  const signature = failureSignature(failedTests);
  const seen = (Array.isArray(presentedSignatures) ? presentedSignatures : []).map((item) => String(item || '')).filter(Boolean);
  const unseen = Boolean(signature) && !seen.includes(signature);
  const nextAttempt = Number(attempts || 0) + (unseen ? 0 : 1);
  const nextPresented = unseen ? [...seen, signature].slice(0, maxAttempts) : seen;
  const capped = Number.isFinite(maxAttempts) && maxAttempts > 0;
  if (capped && ((unseen && seen.length >= maxAttempts) || (!unseen && nextAttempt > maxAttempts))) {
    return { action: 'EXHAUST', signature, unseen, nextPresented: seen, attempts: Number(attempts || 0) };
  }
  return { action: 'REPAIR', signature, unseen, nextPresented, attempts: nextAttempt };
}

export function unansweredExhaustedRepair(job) {
  if (String(job?.status || '').toUpperCase() !== 'FAILED') return null;
  if (String(job?.error || '') !== 'MAX_REPAIR_ATTEMPTS_EXHAUSTED') return null;
  const result = job?.result_json && typeof job.result_json === 'object' ? job.result_json : {};
  const cycleTests = result.repair_cycle?.failed_tests;
  const tests = failureSignature(cycleTests) ? cycleTests : (result.dev_bridge?.tests || cycleTests || []);
  const decision = repairBudgetDecision({
    attempts: Number(result.repair_cycle?.attempts || result.runtime_retry?.attempts || 0),
    failedTests: tests,
    presentedSignatures: result.repair_cycle?.presented_signatures || [],
  });
  return decision.action === 'REPAIR' && decision.unseen ? decision : null;
}

const STALE_TEACHER_APPROVAL_CODES = new Set([
  'TEACHER_APPROVAL_CANDIDATE_SHA_STALE',
  'TEACHER_APPROVAL_CANDIDATE_SHA_REQUIRED',
  'TEACHER_APPROVAL_CANDIDATE_BRANCH_MISMATCH',
  'TEACHER_APPROVAL_CANDIDATE_BRANCH_REQUIRED',
]);

// A diagnostic that has not changed is not rewritten every minute: each
// rewrite is a D1 write and an evolution-ledger event. Refresh at most hourly.
const DIAGNOSTIC_REFRESH_MS = 60 * 60 * 1000;
function sameDiagnostic(previous, next) {
  if (!previous || typeof previous !== 'object') return false;
  const age = Date.now() - Date.parse(String(previous.observed_at || ''));
  if (!(age >= 0 && age < DIAGNOSTIC_REFRESH_MS)) return false;
  const strip = value => JSON.stringify({ ...value, observed_at: null });
  return strip(previous) === strip(next);
}

function safeDiagnosticCode(error, fallback = 'IMPLEMENTATION_PLANNING_FAILED') {
  const raw = String(error?.code || fallback).toUpperCase();
  return /^[A-Z0-9_:-]{1,120}$/.test(raw) ? raw : fallback;
}

async function persistImplementationDiagnostic(repository, jobId, diagnostic) {
  const latest = await repository.get(jobId);
  if (!latest) return null;
  const result = latest.result_json && typeof latest.result_json === 'object' ? { ...latest.result_json } : {};
  const next = {
    status: diagnostic.status === 'READY' ? 'READY' : 'NOT_READY',
    code: diagnostic.status === 'READY' ? null : safeDiagnosticCode({ code: diagnostic.code }),
    observed_at: new Date().toISOString(),
  };
  if (sameDiagnostic(result.implementation_planning_diagnostic, next)) return latest;
  result.implementation_planning_diagnostic = next;
  return repository.update(jobId, { result_json: result });
}

async function requeueStaleTeacherApproval(repository, jobId, diagnosticCode) {
  const latest = await repository.get(jobId);
  if (!latest) return null;
  const bridge = latest?.result_json?.teacher_bridge;
  if (String(latest.status || '').toUpperCase() !== 'TEACHER_APPROVED' || bridge?.status !== 'ANSWERED') {
    return latest;
  }

  const now = new Date().toISOString();
  const code = STALE_TEACHER_APPROVAL_CODES.has(String(diagnosticCode || ''))
    ? String(diagnosticCode)
    : 'TEACHER_APPROVAL_CANDIDATE_SHA_STALE';
  const result = latest.result_json && typeof latest.result_json === 'object' ? { ...latest.result_json } : {};
  const history = Array.isArray(result.teacher_bridge_history) ? [...result.teacher_bridge_history] : [];
  history.push(bridge);
  result.teacher_bridge_history = history.slice(-20);
  result.last_teacher_review = {
    request_id: bridge?.review?.request_id || bridge?.request?.request_id || null,
    verdict: bridge?.review?.verdict || null,
    feedback: bridge?.review?.feedback || '',
    evidence: Array.isArray(bridge?.review?.evidence) ? bridge.review.evidence.slice(0, 100) : [],
    reviewed_at: bridge?.reviewed_at || now,
  };
  result.teacher_bridge = null;
  delete result.implementation_proposal;
  delete result.bridge_package;
  result.implementation_planning_diagnostic = {
    status: 'NOT_READY',
    code,
    observed_at: now,
  };

  const plan = latest.plan_json && typeof latest.plan_json === 'object' ? { ...latest.plan_json } : {};
  plan.preflight = null;
  plan.revision = {
    requested_at: now,
    previous_request_id: bridge?.review?.request_id || bridge?.request?.request_id || null,
    reason: code,
  };

  return repository.update(jobId, {
    status: 'QUEUED',
    plan_json: plan,
    result_json: result,
    error: null,
  });
}

async function persistBridgePreparationDiagnostic(repository, jobId, diagnostic) {
  const latest = await repository.get(jobId);
  if (!latest) return null;
  const result = latest.result_json && typeof latest.result_json === 'object' ? { ...latest.result_json } : {};
  const failures = Array.isArray(diagnostic?.failures)
    ? diagnostic.failures.slice(0, 8).map((row) => ({
        stage: String(row?.stage || '').slice(0, 24),
        code: safeDiagnosticCode({ code: row?.error || row?.code }, 'MENTOR_PROPOSAL_REJECTED'),
      }))
    : [];
  const next = {
    status: diagnostic.status === 'READY' ? 'READY' : 'NOT_READY',
    code: diagnostic.status === 'READY' ? null : safeDiagnosticCode({ code: diagnostic.code }, 'BRIDGE_PREPARATION_FAILED'),
    mentor_failure_codes: failures,
    observed_at: new Date().toISOString(),
  };
  if (sameDiagnostic(result.bridge_preparation_diagnostic, next)) return latest;
  result.bridge_preparation_diagnostic = next;
  return repository.update(jobId, { result_json: result });
}

function deployedInspectionSha(env = {}) {
  const direct = String(env?.MEL_DEPLOYED_GIT_SHA || '').trim();
  if (/^[0-9a-f]{40}$/i.test(direct)) return direct.toLowerCase();
  try {
    const value = typeof MEL_DEPLOYED_GIT_SHA !== 'undefined' ? String(MEL_DEPLOYED_GIT_SHA || '').trim() : '';
    return /^[0-9a-f]{40}$/i.test(value) ? value.toLowerCase() : '';
  } catch {
    return '';
  }
}

function deployedInspectionBranch(env = {}) {
  const direct = String(env?.MEL_DEPLOYED_GIT_BRANCH || '').trim();
  if (direct) return direct;
  try {
    return typeof MEL_DEPLOYED_GIT_BRANCH !== 'undefined' ? String(MEL_DEPLOYED_GIT_BRANCH || '').trim() : '';
  } catch {
    return '';
  }
}

export function resolveAutonomyInspectionRef(env = {}, canonicalBranch = '') {
  const branch = String(canonicalBranch || '').trim();
  const pinnedSha = deployedInspectionSha(env);
  const deployedBranch = deployedInspectionBranch(env);
  const isolatedPreview = String(env?.MEL_PREVIEW_ISOLATED || '').toLowerCase() === 'true'
    || String(env?.MEL_RUNTIME_ENV || '').toLowerCase() === 'preview';
  if (isolatedPreview && deployedBranch === 'main' && pinnedSha) return pinnedSha;
  return branch;
}

function codeConfig(env = {}) {
  const repository = String(env.MEL_GITHUB_REPOSITORY || 'adrienlopezcarreras-pixel/meliturgos-cloudflare');
  const canonicalBranch = String(env.MEL_GITHUB_BRANCH || 'candidate/mel-clean-autonomy').trim();
  const teacherBranch = String(env.MEL_TEACHER_BRANCH || canonicalBranch).trim();
  if (!canonicalBranch.startsWith('candidate/') || !teacherBranch.startsWith('candidate/')) {
    throw Object.assign(new Error('AUTONOMY_BRANCH_NOT_CANDIDATE'), { code: 'AUTONOMY_BRANCH_NOT_CANDIDATE' });
  }
  if (canonicalBranch !== teacherBranch) {
    const error = new Error('AUTONOMY_CANDIDATE_BRANCH_DIVERGENCE');
    error.code = 'AUTONOMY_CANDIDATE_BRANCH_DIVERGENCE';
    error.canonical_branch = canonicalBranch;
    error.teacher_branch = teacherBranch;
    throw error;
  }
  return { repository, branch: canonicalBranch };
}

function requestedInspectionPaths(job) {
  return (Array.isArray(job?.optional_context?.inspection_paths) ? job.optional_context.inspection_paths : [])
    .map(path => String(path || '').trim())
    .filter(path => path && path.length <= 240 && !path.startsWith('/') && !path.split('/').includes('..') && /^[a-zA-Z0-9_./-]+$/.test(path))
    .slice(0, 12);
}

function requestedInspectionQueries(job) {
  const values = [
    job?.optional_context?.roadmap_id,
    job?.optional_context?.target_capability_id,
    ...(Array.isArray(job?.optional_context?.inspection_queries) ? job.optional_context.inspection_queries : []),
  ];
  return [...new Set(values.map(value => String(value || '').trim().slice(0, 240)).filter(Boolean))].slice(0, 10);
}

async function inspectCandidateCode(env, job, { fetchImpl = fetch, minimal = false } = {}) {
  const { repository, branch } = codeConfig(env);
  const deployedSha = deployedInspectionSha(env);
  const inspectionRef = resolveAutonomyInspectionRef(env, branch);
  // A production deployment SHA describes main/release state, not the mutable
  // candidate branch. Pin only when inspectionRef itself is that immutable SHA
  // (isolated preview). Normal production candidate inspection is protected by
  // headBefore/headAfter equality instead of requiring candidate HEAD == main.
  const pinnedSha = /^[0-9a-f]{40}$/i.test(String(inspectionRef || ''))
    && String(inspectionRef).toLowerCase() === String(deployedSha || '').toLowerCase()
    ? deployedSha
    : '';
  const liveReader = createGitHubCodeReader({
    repository,
    branch: inspectionRef,
    token: String(env?.MEL_GITHUB_TOKEN || ''),
    pinnedSha,
    fetchImpl,
  });
  const headBefore = await liveReader.head();
  if (!/^[0-9a-f]{40}$/i.test(String(headBefore?.sha || ''))) {
    throw Object.assign(new Error('AUTONOMY_CANDIDATE_HEAD_INVALID'), { code: 'AUTONOMY_CANDIDATE_HEAD_INVALID' });
  }
  // Inspect an immutable snapshot captured at the start. Concurrent candidate
  // commits may advance the branch, but they cannot change the evidence under
  // review. Later approval/implementation stages still reject stale SHAs.
  const snapshotSha = String(headBefore.sha).toLowerCase();
  const snapshotReader = createGitHubCodeReader({
    repository,
    branch: snapshotSha,
    token: String(env?.MEL_GITHUB_TOKEN || ''),
    pinnedSha: snapshotSha,
    fetchImpl,
  });
  const evidence = [];
  const inspectionQueries = minimal ? [] : requestedInspectionQueries(job);
  for (const query of inspectionQueries) {
    try {
      const search = await snapshotReader.search({ query });
      evidence.push({
        kind: 'CODE_SEARCH',
        query,
        branch,
        repository,
        matches: search.matches.slice(0, 8),
      });
    } catch (error) {
      evidence.push({ kind: 'CODE_SEARCH_FAILED', query, code: error?.code || error?.message || 'UNKNOWN' });
    }
  }

  const requestedPaths = requestedInspectionPaths(job);
  const inspectionFiles = minimal
    ? [...new Set([
        ...requestedPaths,
        'src/evaluation/capability-watch-runtime.js',
        'src/roadmap/master-roadmap.js',
      ])].slice(0, 3)
    : [...new Set([...INSPECTION_FILES, ...requestedPaths])];
  for (const path of inspectionFiles) {
    try {
      const file = await snapshotReader.read(path);
      evidence.push({
        kind: 'CODE_READ',
        path: file.path,
        sha: file.sha || '',
        bytes: new TextEncoder().encode(file.content || '').length,
        branch: file.branch,
        repository: file.repository,
      });
    } catch (error) {
      evidence.push({ kind: 'CODE_READ_FAILED', path, code: error?.code || error?.message || 'UNKNOWN' });
    }
  }

  const successful = evidence.filter((item) => item.kind === 'CODE_READ' || (item.kind === 'CODE_SEARCH' && item.matches?.length));
  if (!successful.length) {
    throw Object.assign(new Error('AUTONOMY_CODE_INSPECTION_FAILED'), { code: 'AUTONOMY_CODE_INSPECTION_FAILED' });
  }
  let headAfter = null;
  try {
    headAfter = await liveReader.head();
  } catch {
    // The immutable snapshot remains valid evidence even if a later freshness
    // probe is temporarily unavailable. Approval remains bound to snapshotSha.
  }
  const headAfterSha = /^[0-9a-f]{40}$/i.test(String(headAfter?.sha || ''))
    ? String(headAfter.sha).toLowerCase()
    : null;
  return {
    status: 'COMPLETE',
    candidate_sha: snapshotSha,
    candidate_sha_source: headBefore.source || null,
    candidate_remote_verified: headBefore.remote_verified === true,
    candidate_head_after: headAfterSha,
    candidate_head_changed_during_inspection: Boolean(headAfterSha && headAfterSha !== snapshotSha),
    evidence,
  };
}

export async function prepareAutonomyTeacherRequest({ env, repository, job, fetchImpl = fetch, minimalInspection = false } = {}) {
  if (!repository || !job) throw Object.assign(new Error('AUTONOMY_RUNTIME_INPUT_REQUIRED'), { code: 'AUTONOMY_RUNTIME_INPUT_REQUIRED' });
  let current = await repository.get(job.id);
  if (!current) throw Object.assign(new Error('JOB_NOT_FOUND'), { code: 'JOB_NOT_FOUND' });
  if (current.result_json?.teacher_bridge?.status === 'WAITING_TEACHER') {
    // The review is already waiting. A later write must not leave the job
    // looking runnable (COUNCIL_COMPLETE) or every tick selects it and stalls.
    if (String(current.status || '').toUpperCase() !== 'WAITING_TEACHER') {
      await repository.update(current.id, { status: 'WAITING_TEACHER', error: null });
    }
    return { ...current.result_json.teacher_bridge, reused: true };
  }
  if (current.result_json?.teacher_bridge?.status === 'ANSWERED') return current.result_json.teacher_bridge;

  const priorReview = current.result_json?.last_teacher_review || null;
  let preflight = current.plan_json?.preflight || null;
  if (!preflight) {
    preflight = await prepareDevelopmentRequest({
      env,
      goal: current.goal,
      context: {
        ...(current.optional_context && typeof current.optional_context === 'object' ? current.optional_context : {}),
        job_id: current.id,
        origin: 'autonomy-runtime-cron',
        rule: 'AI_COUNCIL_BEFORE_CODE',
        teacher_revision: priorReview ? {
          previous_request_id: priorReview.request_id || null,
          verdict: priorReview.verdict || null,
          feedback: priorReview.feedback || '',
        } : null,
      },
      minResponses: 2,
    });
    const plan = current.plan_json && typeof current.plan_json === 'object' ? { ...current.plan_json } : {};
    plan.preflight = preflight;
    current = await repository.update(current.id, { plan_json: plan, status: 'COUNCIL_COMPLETE' });
  }

  const inspection = await inspectCandidateCode(env, current, { fetchImpl, minimal: minimalInspection });
  const { repository: repoName, branch } = codeConfig(env);
  const request = createTeacherReviewRequest({
    goal: current.goal,
    council: preflight.council,
    inspection,
    spec: {
      roadmap_id: current.optional_context?.roadmap_id || null,
      priority: current.optional_context?.priority || 'P0',
      candidate_only: true,
      zero_added_cost: true,
      objective: current.goal,
      teacher_revision: priorReview ? {
        previous_request_id: priorReview.request_id || null,
        feedback: priorReview.feedback || '',
      } : null,
      next: 'ChatGPT Teacher reviews repository evidence and may implement the smallest tested candidate change.',
    },
    candidate: { repository: repoName, branch, sha: inspection.candidate_sha },
    patchSummary: 'No patch generated by the runtime before Teacher review. Candidate-only implementation is delegated to the authorized Teacher/development channel.',
    tests: [],
    security: {
      candidate_only: true,
      no_secret_exposure: true,
      no_destructive_d1: true,
      zero_added_cost: true,
      production_deploy_allowed: false,
    },
    unknowns: [
      'Candidate implementation and CI evidence do not exist yet for this job.',
      'Production deployment is outside this autonomous runtime cycle.',
    ],
    rollback: { strategy: 'candidate branch only; revert candidate commit if tests regress' },
    provenance: {
      source: 'MEL_RUNTIME_CRON',
      job_id: current.id,
      roadmap_id: current.optional_context?.roadmap_id || null,
      repository: repoName,
      branch,
      candidate_sha: inspection.candidate_sha,
      revision_of: priorReview?.request_id || null,
    },
  });

  return queueRuntimeTeacherRequest(repository, current.id, request, {
    runtime_generated: true,
    council_status: preflight.council?.status,
    candidate_sha: inspection.candidate_sha,
    inspection_files: inspection.evidence.filter((item) => item.kind === 'CODE_READ').map((item) => item.path),
    revision_of: priorReview?.request_id || null,
  });
}

/**
 * One bounded autonomous heartbeat. It reconciles trusted GitHub Teacher
 * replies and CI-verified candidate completions first, then ensures the next
 * P0 autonomy job exists. After correlated Teacher approval MEL produces her
 * own multi-AI implementation plan and a second bounded Mentor pass converts
 * that plan into complete source files + allowed tests for the local Dev Bridge.
 * A Teacher approval is valid only for the exact candidate SHA it reviewed. If
 * the branch moves, the job is safely re-queued for a fresh Council + Teacher
 * cycle instead of planning against unreviewed code. Production is never
 * committed or deployed here.
 */
export function autonomyWorkRemaining(state) {
  // An inaccessible evolution queue is never proof that MEL has no work.
  return (Array.isArray(state?.active) && state.active.length > 0)
    || Boolean(state?.next)
    || state?.evolution?.status === 'UNAVAILABLE';
}

export function autonomyQueueReadBlocker(state) {
  return state?.evolution?.status === 'UNAVAILABLE'
    ? (state.evolution.code || 'EVOLUTION_QUEUE_READ_FAILED')
    : null;
}

export async function runAutonomyRuntimeTick(env, { fetchImpl = fetch, repository = null, benchmarkEvaluator = null, benchmarkModelId = '', roadmap = null, maxAutonomy = false, epochMs = null } = {}) {
  const jobRepository = repository || new D1DevJobRepository(env.DB);
  const activityEpoch = epochMs ?? await readActivityListEpoch(env?.DB, { strict: true });
  const currentRepository = currentAutonomyRepository(jobRepository, activityEpoch);
  const reconciliation = await reconcileRuntimeTeacherReplies({ repository: currentRepository, env, fetchImpl }).catch((error) => ({
    ok: false,
    error: error?.code || error?.message || 'TEACHER_RECONCILE_FAILED',
    applied: [],
  }));

  const completions = await reconcileRuntimeCompletions({ repository: currentRepository, env, fetchImpl, benchmarkEvaluator, benchmarkModelId }).catch((error) => ({
    ok: false,
    error: error?.code || error?.message || 'COMPLETION_RECONCILE_FAILED',
    completed: [],
    rejected: [],
  }));

  const evolutionLoader = !roadmap ? createRuntimeEvolutionLoader(env) : null;
  const supervisor = new AutonomySupervisor({
    repository: jobRepository,
    epochMs: activityEpoch,
    ...(roadmap ? { roadmap } : {}),
    evolutionLoader,
  });
  let reopenedUnansweredRepair = false;
  const existing = await jobRepository.list();
  const epoch = Number(activityEpoch) || 0;
  for (const candidate of Array.isArray(existing) ? existing : []) {
    if (epoch && Number(candidate?.created_at || 0) < epoch) continue;
    const by = String(candidate?.requested_by || '');
    if (by !== 'mel-autonomy' && !by.startsWith('owner-chat')) continue;
    const decision = unansweredExhaustedRepair(candidate);
    if (!decision) continue;
    const result = candidate.result_json && typeof candidate.result_json === 'object' ? { ...candidate.result_json } : {};
    delete result.implementation_proposal;
    delete result.bridge_package;
    delete result.bridge_preparation;
    result.autonomy_blocked = false;
    delete result.autonomy_block_reason;
    result.repair_cycle = {
      ...(result.repair_cycle || {}),
      status: 'REQUESTED',
      source: 'UNANSWERED_FAILURE',
      presented_signatures: decision.nextPresented,
      attempts: Number(result.repair_cycle?.attempts || 0),
      max_attempts: MAX_OWNER_MAX_REPAIR_ATTEMPTS,
      reopened_at: new Date().toISOString(),
    };
    await jobRepository.update(candidate.id, { status: 'TEACHER_APPROVED', error: null, result_json: result });
    reopenedUnansweredRepair = true;
    break;
  }
  const stateBefore = await supervisor.state();
  const ensured = await supervisor.ensureNextJob();
  let job = ensured.job;
  const initialJobId = job?.id || null;
  const initialJobStatus = String(job?.status || '').toUpperCase() || null;
  const initialCompletedCount = Array.isArray(stateBefore?.completedIds) ? stateBefore.completedIds.length : 0;
  let teacher = null;
  let teacherMirror = null;
  let runtimeProof = null;
  let implementation = null;
  let bridgePreparation = null;

  if (job) {
    try {
      runtimeProof = await runRuntimeWorkDagResumeProof(env, {
        repository: jobRepository,
        targetJobId: job.id,
      });
      job = await jobRepository.get(job.id);
    } catch (error) {
      runtimeProof = {
        status: 'NOT_VERIFIED',
        code: error?.code || error?.message || 'RUNTIME_WORK_DAG_PROOF_FAILED',
      };
    }
  }

  // A repair result stays inside the same approved goal. Distinguish an
  // implementation/test failure from an executor failure that happened before
  // tests ran: the latter should retry the exact approved package instead of
  // regenerating code unnecessarily.
  const jobStatus = String(job?.status || '').toUpperCase();
  const repairRequested = job && (
    jobStatus === 'REPAIR_REQUIRED'
    || (jobStatus === 'READY_FOR_REVIEW' && job.result_json?.dev_bridge?.needs_repair === true)
  );
  if (repairRequested) {
    const teacherState = job.result_json?.teacher_bridge;
    if (teacherState?.status === 'ANSWERED' && teacherState?.review?.verdict === 'APPROVE_PLAN' && teacherState?.review?.development_allowed === true) {
      const result = job.result_json && typeof job.result_json === 'object' ? { ...job.result_json } : {};
      const previousAttempts = Number(result?.repair_cycle?.attempts || result?.runtime_retry?.attempts || 0);
      const failedTests = (Array.isArray(result?.dev_bridge?.tests) ? result.dev_bridge.tests : [])
        .filter((row) => row?.passed !== true)
        .slice(0, 8)
        .map((row) => ({
          name: String(row?.name || row?.command || '').slice(0, 200),
          command: String(row?.command || '').slice(0, 100),
          exit_code: Number(row?.exit_code || 0),
          error: String(row?.error || '').slice(0, 300),
          stdout: String(row?.stdout || '').slice(0, 2000),
          stderr: String(row?.stderr || '').slice(0, 2000),
        }));
      const decision = repairBudgetDecision({
        attempts: previousAttempts,
        maxAttempts: maxAutonomy === true ? MAX_OWNER_MAX_REPAIR_ATTEMPTS : Infinity,
        failedTests,
        presentedSignatures: result.repair_cycle?.presented_signatures || [],
      });
      const nextAttempt = maxAutonomy === true ? decision.attempts : previousAttempts + 1;
      const executorFailure = jobStatus === 'REPAIR_REQUIRED' && failedTests.length === 0;
      const failureSource = executorFailure ? 'DEV_BRIDGE_EXECUTOR_FAILURE' : 'DEV_BRIDGE_TEST_FAILURE';

      if (maxAutonomy === true && decision.action === 'EXHAUST') {
        result.repair_cycle = {
          ...(result.repair_cycle || {}),
          status: 'EXHAUSTED',
          source: failureSource,
          attempts: previousAttempts,
          max_attempts: MAX_OWNER_MAX_REPAIR_ATTEMPTS,
          failed_tests: failedTests,
          presented_signatures: decision.nextPresented,
          exhausted_at: new Date().toISOString(),
        };
        result.runtime_retry = {
          attempts: previousAttempts,
          max_attempts: MAX_OWNER_MAX_REPAIR_ATTEMPTS,
          last_error: String(result?.dev_bridge?.error || result?.dev_bridge?.diff_summary || failureSource).slice(0, 300),
          exhausted: true,
          updated_at: new Date().toISOString(),
        };
        result.autonomy_blocked = true;
        result.autonomy_block_reason = 'MAX_REPAIR_ATTEMPTS_EXHAUSTED';
        job = await jobRepository.update(job.id, {
          status: 'FAILED',
          result_json: result,
          error: 'MAX_REPAIR_ATTEMPTS_EXHAUSTED',
        });
      } else {
        const requestedAt = new Date().toISOString();
        result.repair_cycle = {
          status: 'REQUESTED',
          source: maxAutonomy === true
            ? (executorFailure ? 'OWNER_MAX_EXECUTOR_FAILURE' : 'OWNER_MAX_TEST_FAILURE')
            : failureSource,
          attempts: nextAttempt,
          max_attempts: maxAutonomy === true ? MAX_OWNER_MAX_REPAIR_ATTEMPTS : null,
          failed_tests: failedTests,
          presented_signatures: decision.nextPresented,
          failed_result_received_at: job.result_json?.dev_bridge?.received_at || null,
          requested_at: requestedAt,
        };
        result.runtime_retry = {
          attempts: nextAttempt,
          max_attempts: maxAutonomy === true ? MAX_OWNER_MAX_REPAIR_ATTEMPTS : null,
          last_error: String(result?.dev_bridge?.error || result?.dev_bridge?.diff_summary || failureSource).slice(0, 300),
          executor_retry: executorFailure,
          updated_at: requestedAt,
        };

        if (!executorFailure) {
          // A failed test invalidates the generated implementation/package.
          delete result.implementation_proposal;
          delete result.bridge_package;
          delete result.bridge_preparation;
        }
        // An executor-only failure keeps the exact approved package intact so
        // the corrected bridge can retry it atomically on the next heartbeat.
        job = await jobRepository.update(job.id, {
          status: 'TEACHER_APPROVED',
          result_json: result,
          error: null,
        });
      }
    }
  }

  if (job && ['QUEUED', 'CLAIMED', 'COUNCIL_COMPLETE', 'READY_FOR_REVIEW'].includes(String(job.status || '').toUpperCase())) {
    teacher = await prepareAutonomyTeacherRequest({ env, repository: jobRepository, job, fetchImpl });
    job = await jobRepository.get(job.id);
  }

  if (job && droppedTeacherApproval(job)) {
    job = await jobRepository.update(job.id, { status: 'TEACHER_APPROVED', error: null });
  }

  if (job && String(job.status || '').toUpperCase() === 'WAITING_TEACHER' && job.result_json?.teacher_bridge) {
    try {
      teacherMirror = await mirrorRuntimeTeacherRequestToGitHub({
        env,
        job,
        state: job.result_json.teacher_bridge,
        fetchImpl,
      });
    } catch (error) {
      teacherMirror = {
        status: 'FAILED',
        code: error?.code || error?.message || 'TEACHER_MIRROR_FAILED',
        request_id: job.result_json.teacher_bridge?.request?.request_id || null,
      };
    }
  }

  if (job && String(job.status || '').toUpperCase() === 'TEACHER_APPROVED') {
    try {
      implementation = await prepareApprovedImplementationProposal({
        env,
        repository: jobRepository,
        job,
        fetchImpl,
      });
      await persistImplementationDiagnostic(jobRepository, job.id, { status: 'READY' });
      job = await jobRepository.get(job.id);
    } catch (error) {
      implementation = {
        status: 'NOT_READY',
        code: safeDiagnosticCode(error),
      };
      if (STALE_TEACHER_APPROVAL_CODES.has(implementation.code)) {
        job = await requeueStaleTeacherApproval(jobRepository, job.id, implementation.code);
      } else {
        await persistImplementationDiagnostic(jobRepository, job.id, implementation);
        job = await jobRepository.get(job.id);
      }
    }

    if (implementation?.status === 'READY' && job && String(job.status || '').toUpperCase() === 'TEACHER_APPROVED') {
      try {
        bridgePreparation = await prepareApprovedBridgePackage({
          env,
          repository: jobRepository,
          job,
          fetchImpl,
        });
        await persistBridgePreparationDiagnostic(jobRepository, job.id, { status: 'READY' });
        job = await jobRepository.get(job.id);
      } catch (error) {
        bridgePreparation = {
          status: 'NOT_READY',
          code: safeDiagnosticCode(error, 'BRIDGE_PREPARATION_FAILED'),
          failures: Array.isArray(error?.failures) ? error.failures : [],
        };
        await persistBridgePreparationDiagnostic(jobRepository, job.id, bridgePreparation);
        job = await jobRepository.get(job.id);
      }
    }
  }

  const state = await supervisor.state();
  const finalJobStatus = String(job?.status || '').toUpperCase() || null;
  const progressEvents = [];
  if (ensured?.created === true) progressEvents.push('JOB_CREATED');
  if (Array.isArray(reconciliation?.applied) && reconciliation.applied.length > 0) progressEvents.push('TEACHER_REPLY_RECONCILED');
  if (Array.isArray(completions?.completed) && completions.completed.length > 0) progressEvents.push('JOB_COMPLETED');
  if (Array.isArray(completions?.rejected) && completions.rejected.length > 0) progressEvents.push('COMPLETION_REJECTED_AND_DIAGNOSED');
  if (reopenedUnansweredRepair) progressEvents.push('JOB_STATE_ADVANCED');
  if (teacher?.status === 'WAITING_TEACHER' && teacher?.reused !== true) progressEvents.push('TEACHER_REQUEST_CREATED');
  if (String(teacherMirror?.status || '').toUpperCase() === 'MIRRORED') progressEvents.push('TEACHER_REQUEST_MIRRORED');
  if (implementation?.status === 'READY' && implementation?.reused !== true) progressEvents.push('IMPLEMENTATION_PREPARED');
  if (bridgePreparation?.status === 'READY' && bridgePreparation?.reused !== true) progressEvents.push('BRIDGE_PACKAGE_PREPARED');
  if (initialJobId && job?.id === initialJobId && initialJobStatus && finalJobStatus && initialJobStatus !== finalJobStatus) {
    progressEvents.push('JOB_STATE_ADVANCED');
  }
  if ((Array.isArray(state?.completedIds) ? state.completedIds.length : 0) > initialCompletedCount) {
    progressEvents.push('ROADMAP_COMPLETION_ADVANCED');
  }
  const activeCount = Array.isArray(state?.active) ? state.active.length : 0;
  const workRemaining = autonomyWorkRemaining(state);
  const waitingExternal = finalJobStatus === 'WAITING_TEACHER'
    || String(ensured?.external_progress?.status || '').length > 0;
  const blockReason = bridgePreparation?.status === 'NOT_READY'
    ? (bridgePreparation.code || 'BRIDGE_PREPARATION_NOT_READY')
    : implementation?.status === 'NOT_READY'
      ? (implementation.code || 'IMPLEMENTATION_NOT_READY')
      : runtimeProof?.status === 'NOT_VERIFIED'
        ? (runtimeProof.code || 'RUNTIME_WORK_DAG_PROOF_NOT_VERIFIED')
        : waitingExternal
          ? (ensured?.external_progress?.status || 'WAITING_EXTERNAL_PROGRESS')
          : autonomyQueueReadBlocker(state);
  const advanced = autonomyTickAdvanced(progressEvents);

  return {
    ok: true,
    advanced,
    progress: {
      advanced,
      events: progressEvents,
      work_remaining: workRemaining,
      waiting_external: waitingExternal,
      block_reason: blockReason,
      active_jobs: activeCount,
      completed_roadmap_items: Array.isArray(state?.completedIds) ? state.completedIds.length : 0,
      next_roadmap_id: state?.next?.id || null,
      evolution_queue: state?.evolution || null,
      job_id: job?.id || null,
      job_status: finalJobStatus,
    },
    reconciliation,
    completions,
    runtime_proof: runtimeProof ? {
      status: runtimeProof.status,
      reused: runtimeProof.reused === true,
      recovered_interrupted_node: runtimeProof.recovered_interrupted_node === true,
      providers_attempted: Number(runtimeProof.providers_attempted || 0),
      successful_candidates: Number(runtimeProof.successful_candidates || 0),
      code: runtimeProof.code || null,
    } : null,
    teacher_mirror: teacherMirror ? {
      status: teacherMirror.status,
      request_id: teacherMirror.request_id || null,
      path: teacherMirror.path || null,
      code: teacherMirror.code || null,
    } : null,
    implementation: implementation ? {
      status: implementation.status,
      reused: implementation.reused === true,
      teacher_request_id: implementation.teacher_request_id || null,
      inspected_files: Array.isArray(implementation.inspected_files) ? implementation.inspected_files.map((row) => row.path).slice(0, 8) : [],
      providers_attempted: Array.isArray(implementation.providers_attempted) ? implementation.providers_attempted.length : 0,
      selected_provider: implementation.selected?.provider || null,
      selected_model: implementation.selected?.model || null,
      code: implementation.code || null,
    } : null,
    bridge_preparation: bridgePreparation ? {
      status: bridgePreparation.status,
      reused: bridgePreparation.reused === true,
      candidate_branch: bridgePreparation.candidate_branch || null,
      candidate_sha: bridgePreparation.candidate_sha || null,
      files: Array.isArray(bridgePreparation.files) ? bridgePreparation.files.slice(0, 10) : [],
      tests: Array.isArray(bridgePreparation.tests) ? bridgePreparation.tests.slice(0, 4) : [],
      mentor_mode: bridgePreparation.mentor?.mode || null,
      code: bridgePreparation.code || null,
    } : null,
    ensured: { created: ensured.created, complete: ensured.complete || false, next: ensured.next || null },
    job: job ? { id: job.id, status: job.status, goal: job.goal, roadmap_id: job.optional_context?.roadmap_id || null } : null,
    teacher: teacher ? { status: teacher.status, request_id: teacher.request?.request_id || null } : null,
    next: state.next,
  };
}

export { requeueStaleTeacherApproval };

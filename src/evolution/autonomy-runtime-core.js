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

const STALE_TEACHER_APPROVAL_CODES = new Set([
  'TEACHER_APPROVAL_CANDIDATE_SHA_STALE',
  'TEACHER_APPROVAL_CANDIDATE_SHA_REQUIRED',
  'TEACHER_APPROVAL_CANDIDATE_BRANCH_MISMATCH',
  'TEACHER_APPROVAL_CANDIDATE_BRANCH_REQUIRED',
]);

function safeDiagnosticCode(error, fallback = 'IMPLEMENTATION_PLANNING_FAILED') {
  const raw = String(error?.code || fallback).toUpperCase();
  return /^[A-Z0-9_:-]{1,120}$/.test(raw) ? raw : fallback;
}

async function persistImplementationDiagnostic(repository, jobId, diagnostic) {
  const latest = await repository.get(jobId);
  if (!latest) return null;
  const result = latest.result_json && typeof latest.result_json === 'object' ? { ...latest.result_json } : {};
  result.implementation_planning_diagnostic = {
    status: diagnostic.status === 'READY' ? 'READY' : 'NOT_READY',
    code: diagnostic.status === 'READY' ? null : safeDiagnosticCode({ code: diagnostic.code }),
    observed_at: new Date().toISOString(),
  };
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
  result.bridge_preparation_diagnostic = {
    status: diagnostic.status === 'READY' ? 'READY' : 'NOT_READY',
    code: diagnostic.status === 'READY' ? null : safeDiagnosticCode({ code: diagnostic.code }, 'BRIDGE_PREPARATION_FAILED'),
    observed_at: new Date().toISOString(),
  };
  return repository.update(jobId, { result_json: result });
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

async function inspectCandidateCode(env, job, { fetchImpl = fetch } = {}) {
  const { repository, branch } = codeConfig(env);
  const reader = createGitHubCodeReader({ repository, branch, fetchImpl });
  const headBefore = await reader.head();
  if (!/^[0-9a-f]{40}$/i.test(String(headBefore?.sha || ''))) {
    throw Object.assign(new Error('AUTONOMY_CANDIDATE_HEAD_INVALID'), { code: 'AUTONOMY_CANDIDATE_HEAD_INVALID' });
  }
  const evidence = [];
  const roadmapId = String(job?.optional_context?.roadmap_id || '').trim();
  if (roadmapId) {
    try {
      const search = await reader.search({ query: roadmapId });
      evidence.push({
        kind: 'CODE_SEARCH',
        query: roadmapId,
        branch,
        repository,
        matches: search.matches.slice(0, 8),
      });
    } catch (error) {
      evidence.push({ kind: 'CODE_SEARCH_FAILED', query: roadmapId, code: error?.code || error?.message || 'UNKNOWN' });
    }
  }

  for (const path of INSPECTION_FILES) {
    try {
      const file = await reader.read(path);
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
  const headAfter = await reader.head();
  if (!/^[0-9a-f]{40}$/i.test(String(headAfter?.sha || ''))) {
    throw Object.assign(new Error('AUTONOMY_CANDIDATE_HEAD_INVALID'), { code: 'AUTONOMY_CANDIDATE_HEAD_INVALID' });
  }
  if (String(headBefore.sha).toLowerCase() !== String(headAfter.sha).toLowerCase()) {
    throw Object.assign(new Error('CANDIDATE_HEAD_CHANGED_DURING_INSPECTION'), { code: 'CANDIDATE_HEAD_CHANGED_DURING_INSPECTION' });
  }
  return { status: 'COMPLETE', candidate_sha: headAfter.sha, evidence };
}

export async function prepareAutonomyTeacherRequest({ env, repository, job, fetchImpl = fetch } = {}) {
  if (!repository || !job) throw Object.assign(new Error('AUTONOMY_RUNTIME_INPUT_REQUIRED'), { code: 'AUTONOMY_RUNTIME_INPUT_REQUIRED' });
  let current = await repository.get(job.id);
  if (!current) throw Object.assign(new Error('JOB_NOT_FOUND'), { code: 'JOB_NOT_FOUND' });
  if (current.result_json?.teacher_bridge?.status === 'WAITING_TEACHER') return current.result_json.teacher_bridge;
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

  const inspection = await inspectCandidateCode(env, current, { fetchImpl });
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
export async function runAutonomyRuntimeTick(env, { fetchImpl = fetch, repository = null } = {}) {
  const jobRepository = repository || new D1DevJobRepository(env.DB);
  const reconciliation = await reconcileRuntimeTeacherReplies({ repository: jobRepository, env, fetchImpl }).catch((error) => ({
    ok: false,
    error: error?.code || error?.message || 'TEACHER_RECONCILE_FAILED',
    applied: [],
  }));

  const completions = await reconcileRuntimeCompletions({ repository: jobRepository, env, fetchImpl }).catch((error) => ({
    ok: false,
    error: error?.code || error?.message || 'COMPLETION_RECONCILE_FAILED',
    completed: [],
    rejected: [],
  }));

  const supervisor = new AutonomySupervisor({ repository: jobRepository });
  const ensured = await supervisor.ensureNextJob();
  let job = ensured.job;
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

  // A local candidate whose tests failed stays inside the same approved goal.
  // Reopen only the implementation stage; never bypass or replace the existing
  // correlated Teacher approval, and never widen the original objective.
  if (job && String(job.status || '').toUpperCase() === 'READY_FOR_REVIEW' && job.result_json?.dev_bridge?.needs_repair === true) {
    const teacherState = job.result_json?.teacher_bridge;
    if (teacherState?.status === 'ANSWERED' && teacherState?.review?.verdict === 'APPROVE_PLAN' && teacherState?.review?.development_allowed === true) {
      const result = job.result_json && typeof job.result_json === 'object' ? { ...job.result_json } : {};
      result.repair_cycle = {
        status: 'REQUESTED',
        source: 'DEV_BRIDGE_TEST_FAILURE',
        failed_result_received_at: job.result_json.dev_bridge.received_at || null,
        requested_at: new Date().toISOString(),
      };
      job = await jobRepository.update(job.id, { status: 'TEACHER_APPROVED', result_json: result });
    }
  }

  if (job && ['QUEUED', 'CLAIMED', 'COUNCIL_COMPLETE', 'READY_FOR_REVIEW'].includes(String(job.status || '').toUpperCase())) {
    teacher = await prepareAutonomyTeacherRequest({ env, repository: jobRepository, job, fetchImpl });
    job = await jobRepository.get(job.id);
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
        };
        await persistBridgePreparationDiagnostic(jobRepository, job.id, bridgePreparation);
        job = await jobRepository.get(job.id);
      }
    }
  }

  const state = await supervisor.state();
  return {
    ok: true,
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

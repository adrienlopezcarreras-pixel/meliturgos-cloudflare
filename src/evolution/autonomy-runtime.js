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

const INSPECTION_FILES = [
  'AUTONOMY_STATE.json',
  'TEACHER_BRIDGE.md',
  'src/roadmap/master-roadmap.js',
  'src/evolution/autonomy-supervisor.js',
  'src/evolution/autonomy-proof.js',
  'src/evolution/autonomy-implementation-planner.js',
  'src/dev/runtime-api.js',
  'src/work/work-dag.js',
  'src/work/autonomous-work-loop.js',
  'src/teachers/runtime-teacher-bridge.js',
  'src/teachers/github-completion-reconciler.js',
];

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

function codeConfig(env = {}) {
  const repository = String(env.MEL_GITHUB_REPOSITORY || 'adrienlopezcarreras-pixel/meliturgos-cloudflare');
  const branch = String(env.MEL_TEACHER_BRANCH || 'candidate/augmentio-core');
  if (!branch.startsWith('candidate/')) {
    throw Object.assign(new Error('AUTONOMY_BRANCH_NOT_CANDIDATE'), { code: 'AUTONOMY_BRANCH_NOT_CANDIDATE' });
  }
  return { repository, branch };
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
 * P0 autonomy job exists. The first available autonomy job receives a one-time
 * live Work DAG resume proof using .augmentio. After a correlated APPROVE_PLAN,
 * MEL also performs her own bounded multi-AI CODE planning pass over inspected
 * candidate sources in the same heartbeat and persists that work product.
 *
 * READY_FOR_REVIEW is accepted as a recoverable pre-Teacher state because
 * legacy/dev-agent work can legitimately leave an autonomy job there before
 * the Teacher bridge has been queued. The bridge itself remains the authority:
 * an existing WAITING_TEACHER/ANSWERED package is never regenerated.
 *
 * Internally generated roadmap requests are optionally mirrored to one unique
 * GitHub file when MEL_GITHUB_TOKEN exists. The D1 bridge remains authoritative;
 * mirroring is only a connector-friendly transport for the external Teacher and
 * never blocks autonomy if unavailable.
 *
 * A NEEDS_CHANGES review is converted back to QUEUED with the previous Teacher
 * feedback injected into a fresh Council preflight. Completion reconciliation
 * happens before selection so a finished job can release the next roadmap item
 * immediately. Production code is never edited or deployed by this heartbeat.
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
      await persistImplementationDiagnostic(jobRepository, job.id, implementation);
      job = await jobRepository.get(job.id);
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
    ensured: { created: ensured.created, complete: ensured.complete || false, next: ensured.next || null },
    job: job ? { id: job.id, status: job.status, goal: job.goal, roadmap_id: job.optional_context?.roadmap_id || null } : null,
    teacher: teacher ? { status: teacher.status, request_id: teacher.request?.request_id || null } : null,
    next: state.next,
  };
}

import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import { listPendingRuntimeTeacherRequests, teacherBridgePublicView } from './runtime-teacher-bridge.js';
import { isSupervisedAutonomyJob } from '../evolution/autonomy-supervisor.js';

const TERMINAL = new Set(['COMPLETED', 'COMMITTED', 'CANCELLED', 'FAILED']);
const PUBLIC_PATHS = new Set(['/api/teacher/pending', '/api/teacher/status', '/api/teacher/work', '/api/teacher/bridge.txt']);
const SECRET_VALUE = /(bearer\s+[a-z0-9._~+/=-]{8,}|\bsk-[a-z0-9_-]{8,}|\bgh[pousr]_[a-z0-9]{12,}|(?:api[_ -]?key|token|password|secret|cookie|otp)\s*[:=]\s*[^\s,;]{6,})/gi;
const SHA40 = /^[0-9a-f]{40}$/i;
const SAFE_DIAGNOSTIC_CODE = /^[A-Z0-9_]{1,80}$/;

function redactPlanText(value) {
  return String(value || '').replace(SECRET_VALUE, '[REDACTED]').slice(0, 12000);
}

function publicDiagnosticCode(job) {
  const code = String(job?.result_json?.implementation_planning_diagnostic?.code || '').trim();
  return SAFE_DIAGNOSTIC_CODE.test(code) ? code : null;
}

function currentTeacherMetadata(job) {
  const bridge = job?.result_json?.teacher_bridge || null;
  if (!bridge) return { teacher_status: null, request_id: null, verdict: null };
  return {
    teacher_status: bridge.status || null,
    request_id: bridge.request?.request_id || bridge.review?.request_id || null,
    verdict: bridge.review?.verdict || null,
  };
}

function summarizeAutonomyJobs(jobs = []) {
  const autonomy = jobs.filter(isSupervisedAutonomyJob);
  const active = autonomy.filter((job) => !TERMINAL.has(String(job.status || '').toUpperCase()));
  const current = active
    .slice()
    .sort((a, b) => {
      const ownerA = a?.requested_by === 'owner-chat' ? 0 : 1;
      const ownerB = b?.requested_by === 'owner-chat' ? 0 : 1;
      return ownerA - ownerB || Number(a.created_at || 0) - Number(b.created_at || 0);
    })[0] || null;
  const teacher = current ? currentTeacherMetadata(current) : null;
  const proposal = current?.result_json?.implementation_proposal || null;
  return {
    total: autonomy.length,
    active_count: active.length,
    owner_requested_count: autonomy.filter((job) => job?.requested_by === 'owner-chat').length,
    waiting_teacher_count: autonomy.filter((job) => String(job.status || '').toUpperCase() === 'WAITING_TEACHER').length,
    teacher_approved_count: autonomy.filter((job) => String(job.status || '').toUpperCase() === 'TEACHER_APPROVED').length,
    completed_count: autonomy.filter((job) => ['COMPLETED', 'COMMITTED'].includes(String(job.status || '').toUpperCase())).length,
    failed_count: autonomy.filter((job) => String(job.status || '').toUpperCase() === 'FAILED').length,
    current: current ? {
      job_id: String(current.id || ''),
      requested_by: current.requested_by === 'owner-chat' ? 'owner-chat' : 'mel-autonomy',
      status: String(current.status || ''),
      roadmap_id: current?.optional_context?.roadmap_id || null,
      teacher_status: teacher.teacher_status,
      request_id: teacher.request_id,
      verdict: teacher.verdict,
      implementation_proposal_ready: proposal?.status === 'READY',
      implementation_models: proposal?.status === 'READY' && Array.isArray(proposal.providers_attempted) ? proposal.providers_attempted.length : 0,
      implementation_diagnostic_code: publicDiagnosticCode(current),
    } : null,
  };
}

function minimizePending(rows) {
  return teacherBridgePublicView(rows).map((item) => ({
    request_id: item.request_id,
    type: item.type,
    created_at: item.created_at,
    job_id: item.job_id,
    stage: item.stage,
    candidate: item.candidate,
    patch_summary: item.patch_summary,
    tests: item.tests,
    unknowns: item.unknowns,
    requested_review: item.requested_review,
    provenance: item.provenance,
  }));
}

function safeInternalWorkPackage(jobs = []) {
  const eligible = jobs
    .filter((job) => job?.requested_by === 'mel-autonomy')
    .filter((job) => String(job?.status || '').toUpperCase() === 'TEACHER_APPROVED')
    .filter((job) => Boolean(job?.optional_context?.roadmap_id))
    .filter((job) => job?.result_json?.teacher_bridge?.status === 'ANSWERED')
    .filter((job) => job?.result_json?.teacher_bridge?.review?.verdict === 'APPROVE_PLAN')
    .filter((job) => job?.result_json?.implementation_proposal?.status === 'READY')
    .filter((job) => SHA40.test(String(job?.result_json?.implementation_proposal?.candidate_sha || '')))
    .sort((a, b) => Number(a.created_at || 0) - Number(b.created_at || 0));
  const job = eligible[0];
  if (!job) return null;

  const bridge = job.result_json.teacher_bridge;
  const proposal = job.result_json.implementation_proposal;
  const requestId = String(bridge?.request?.request_id || '');
  if (!requestId || String(proposal.teacher_request_id || '') !== requestId) return null;
  if (!String(proposal.candidate_branch || '').startsWith('candidate/')) return null;

  return {
    kind: 'MEL_INTERNAL_WORK_PACKAGE',
    schema_version: 1,
    job_id: String(job.id || ''),
    request_id: requestId,
    roadmap_id: String(job.optional_context.roadmap_id || ''),
    priority: String(job.optional_context.priority || 'P0'),
    candidate_branch: String(proposal.candidate_branch || ''),
    candidate_sha: String(proposal.candidate_sha || ''),
    created_at: proposal.created_at || null,
    inspected_files: Array.isArray(proposal.inspected_files)
      ? proposal.inspected_files.map((row) => ({ path: String(row?.path || '').slice(0, 500), sha: String(row?.sha || '').slice(0, 100) })).filter((row) => row.path).slice(0, 8)
      : [],
    providers_attempted: Array.isArray(proposal.providers_attempted) ? proposal.providers_attempted.length : 0,
    selected_model: String(proposal.selected?.model || '').slice(0, 200),
    plan: redactPlanText(proposal.selected?.text || ''),
    next: 'APPLY_SMALLEST_CANDIDATE_DIFF_THEN_VERIFY_FULL_CANDIDATE_CI',
    production_deploy_allowed: false,
    owner_intervention_required: false,
  };
}

function bridgeSnapshot(pending, jobs) {
  const work = safeInternalWorkPackage(jobs);
  return {
    ok: true,
    channel: 'github-teacher-bridge',
    pending,
    autonomy: summarizeAutonomyJobs(jobs),
    work,
    work_available: Boolean(work),
    exposes_secrets: false,
    exposes_goals: false,
    exposes_owner_chat_work: false,
    exposes_internal_implementation_text: Boolean(work),
    mutation_allowed: false,
  };
}

/**
 * Deliberately public, read-only and aggressively minimized so the external
 * ChatGPT Teacher can discover pending technical requests without receiving a
 * MEL secret. Opaque job/request ids and roadmap ids are exposed for reliable
 * correlation; free-form owner goals/objectives, council text, inspection
 * contents and all owner-chat implementation plans remain private.
 *
 * /api/teacher/work exposes at most one implementation plan, only when the job
 * was generated internally from the public MEL roadmap (`mel-autonomy`) and a
 * correlated Teacher approval already exists. Owner-chat jobs are never
 * eligible for this public work-package endpoint.
 *
 * /api/teacher/bridge.txt is the same sanitized read-only bridge represented as
 * plain text. It exists for generic browser/extractor clients that do not
 * reliably preserve application/json response bodies; it grants no mutation
 * capability and contains no additional fields beyond the safe public views.
 */
export async function maybeHandlePublicTeacherBridge(request, env) {
  if (request.method !== 'GET') return null;
  const url = new URL(request.url);
  if (!PUBLIC_PATHS.has(url.pathname)) return null;

  const repository = new D1DevJobRepository(env.DB);
  const [pendingRows, jobs] = await Promise.all([
    listPendingRuntimeTeacherRequests(repository, { limit: 20 }),
    repository.list(),
  ]);
  const pending = minimizePending(pendingRows);
  const autonomy = summarizeAutonomyJobs(jobs);
  const jsonHeaders = {
    'cache-control': 'no-store, max-age=0',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  };

  if (url.pathname === '/api/teacher/bridge.txt') {
    const snapshot = bridgeSnapshot(pending, jobs);
    return new Response(`${JSON.stringify(snapshot, null, 2)}\n`, {
      status: 200,
      headers: {
        'cache-control': 'no-store, max-age=0',
        'content-type': 'text/plain; charset=utf-8',
        'x-content-type-options': 'nosniff',
      },
    });
  }

  if (url.pathname === '/api/teacher/status') {
    return new Response(JSON.stringify({
      ok: true,
      channel: 'github-teacher-bridge',
      pending_count: pending.length,
      autonomy,
      internal_work_package_ready: Boolean(safeInternalWorkPackage(jobs)),
      exposes_secrets: false,
      exposes_goals: false,
      exposes_implementation_text: false,
      exposes_owner_chat_work: false,
      mutation_allowed: false,
    }), { status: 200, headers: jsonHeaders });
  }

  if (url.pathname === '/api/teacher/work') {
    const work = safeInternalWorkPackage(jobs);
    return new Response(JSON.stringify({
      ok: true,
      channel: 'github-teacher-bridge',
      work,
      work_available: Boolean(work),
      exposes_secrets: false,
      exposes_goals: false,
      exposes_owner_chat_work: false,
      exposes_internal_implementation_text: Boolean(work),
      owner_chat_exposed: false,
      mutation_allowed: false,
    }), { status: 200, headers: jsonHeaders });
  }

  return new Response(JSON.stringify({
    ok: true,
    channel: 'github-teacher-bridge',
    pending,
    autonomy,
    exposes_secrets: false,
    exposes_goals: false,
    exposes_implementation_text: false,
    exposes_owner_chat_work: false,
    mutation_allowed: false,
  }), { status: 200, headers: jsonHeaders });
}

export { summarizeAutonomyJobs, safeInternalWorkPackage, redactPlanText, bridgeSnapshot, publicDiagnosticCode };

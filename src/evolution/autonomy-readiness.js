import { AutonomySupervisor, isSupervisedAutonomyJob } from './autonomy-supervisor.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function councilProof(job) {
  const council = job?.plan_json?.preflight?.council;
  if (!council || council.status !== 'COMPLETE' || council.phase !== 'STATE_OF_PLAY_BEFORE_DEVELOPMENT') return null;
  const responses = asArray(council.responses);
  const usable = responses.filter((row) => row?.member && row?.answer != null);
  const members = [...new Set(usable.map((row) => String(row.member)))];
  const allExplicitZero = usable.length >= 2 && usable.every((row) => {
    const cost = row?.answer?.estimated_cost;
    return typeof cost === 'number' && Number.isFinite(cost) && cost === 0;
  });
  if (members.length < 2 || !allExplicitZero) return null;
  return {
    job_id: job.id,
    response_count: usable.length,
    distinct_members: members.length,
    members: members.slice(0, 12),
    explicit_zero_added_cost: true,
    phase: council.phase,
  };
}

function workDagProof(job) {
  const proof = job?.result_json?.autonomy_proofs?.work_dag_resume;
  if (!proof || proof.status !== 'VERIFIED') return null;
  if (proof.recovered_interrupted_node !== true || Number(proof.providers_attempted || 0) < 2) return null;
  return {
    job_id: job.id,
    verified_at: proof.verified_at || null,
    recovered_interrupted_node: true,
    providers_attempted: Number(proof.providers_attempted || 0),
    successful_candidates: Number(proof.successful_candidates || 0),
    zero_added_cost_policy: proof.zero_added_cost_policy || null,
  };
}

function proofFromAnsweredBridge(job, bridge, source = 'current') {
  if (!bridge || bridge.status !== 'ANSWERED') return null;
  const request = bridge.request;
  const review = bridge.review;
  const requestId = String(request?.request_id || '');
  if (!requestId || String(review?.request_id || '') !== requestId) return null;
  if (String(request?.provenance?.source || '') !== 'MEL_RUNTIME_CRON') return null;
  if (!['APPROVE_PLAN', 'NEEDS_CHANGES', 'REJECT'].includes(String(review?.verdict || ''))) return null;
  return {
    job_id: job.id,
    request_id: requestId,
    verdict: review.verdict,
    reviewed_at: bridge.reviewed_at || review.reviewed_at || null,
    runtime_generated: true,
    request_reply_correlated: true,
    source,
  };
}

function teacherRoundTripProof(job) {
  const current = proofFromAnsweredBridge(job, job?.result_json?.teacher_bridge, 'current');
  if (current) return current;
  const history = asArray(job?.result_json?.teacher_bridge_history);
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const proof = proofFromAnsweredBridge(job, history[index], 'history');
    if (proof) return proof;
  }
  return null;
}

function implementationPlanProof(job) {
  const bridge = job?.result_json?.teacher_bridge;
  const proposal = job?.result_json?.implementation_proposal;
  if (!proposal || proposal.status !== 'READY') return null;
  const requestId = String(proposal.teacher_request_id || '');
  if (!requestId || requestId !== String(bridge?.request?.request_id || '')) return null;
  if (bridge?.status !== 'ANSWERED' || bridge?.review?.verdict !== 'APPROVE_PLAN' || bridge?.review?.development_allowed !== true) return null;
  if (!String(proposal.candidate_branch || '').startsWith('candidate/')) return null;
  if (!Array.isArray(proposal.providers_attempted) || proposal.providers_attempted.length < 2) return null;
  if (!Array.isArray(proposal.inspected_files) || proposal.inspected_files.length < 1) return null;
  if (!proposal.selected?.text || !proposal.selected?.model) return null;
  if (proposal.production_touched !== false || proposal.candidate_write_performed !== false) return null;
  return {
    job_id: job.id,
    request_id: requestId,
    candidate_branch: proposal.candidate_branch,
    providers_attempted: proposal.providers_attempted.length,
    inspected_files: proposal.inspected_files.map((row) => row?.path).filter(Boolean).slice(0, 8),
    selected_model: proposal.selected.model,
    created_at: proposal.created_at || null,
  };
}

function completionProof(job) {
  const completion = job?.result_json?.autonomy_completion;
  if (!completion || completion.status !== 'VERIFIED') return null;
  const ci = completion.ci;
  if (!ci || ci.verified !== true || ci.workflow !== 'full-candidate-ci' || ci.conclusion !== 'success') return null;
  const sha = String(completion.candidate_sha || ci.head_sha || '');
  const branch = String(completion.candidate_branch || ci.head_branch || '');
  if (!/^[a-f0-9]{40}$/i.test(sha) || !branch.startsWith('candidate/')) return null;
  const requestId = String(completion.request_id || '');
  if (!requestId || requestId !== String(job?.result_json?.teacher_bridge?.request?.request_id || '')) return null;
  if (job?.result_json?.implementation_proposal?.teacher_request_id !== requestId) return null;
  return {
    job_id: job.id,
    request_id: requestId,
    candidate_sha: sha,
    candidate_branch: branch,
    ci_run_id: ci.run_id || null,
    workflow: ci.workflow,
    conclusion: ci.conclusion,
    completed_at: completion.completed_at || null,
  };
}

function firstProof(jobs, finder) {
  for (const job of jobs) {
    const proof = finder(job);
    if (proof) return proof;
  }
  return null;
}

export async function getAutonomyReadiness({ repository } = {}) {
  if (!repository || typeof repository.list !== 'function') {
    throw Object.assign(new Error('AUTONOMY_JOB_REPOSITORY_REQUIRED'), { code: 'AUTONOMY_JOB_REPOSITORY_REQUIRED' });
  }

  const jobs = (await repository.list()).filter(isSupervisedAutonomyJob);
  const council = firstProof(jobs, councilProof);
  const workDag = firstProof(jobs, workDagProof);
  const teacherRoundTrip = firstProof(jobs, teacherRoundTripProof);
  const implementationPlan = firstProof(jobs, implementationPlanProof);
  const completion = firstProof(jobs, completionProof);
  const supervisor = new AutonomySupervisor({ repository });
  const state = await supervisor.state();

  const gates = {
    live_council_zero_cost: Boolean(council),
    runtime_work_dag_resume: Boolean(workDag),
    runtime_teacher_round_trip: Boolean(teacherRoundTrip),
    mel_multi_ai_implementation_plan: Boolean(implementationPlan),
    ci_verified_candidate_completion: Boolean(completion),
  };
  const blockers = [];
  if (!gates.live_council_zero_cost) blockers.push('LIVE_COUNCIL_ZERO_COST_NOT_PROVEN');
  if (!gates.runtime_work_dag_resume) blockers.push('GENERAL_WORK_DAG_RESUME_NOT_VERIFIED');
  if (!gates.runtime_teacher_round_trip) blockers.push('LIVE_TEACHER_ROUND_TRIP_NOT_PROVEN');
  if (!gates.mel_multi_ai_implementation_plan) blockers.push('MEL_APPROVED_IMPLEMENTATION_PLAN_NOT_PROVEN');
  if (!gates.ci_verified_candidate_completion) blockers.push('CI_VERIFIED_AUTONOMOUS_COMPLETION_NOT_PROVEN');

  const ready = blockers.length === 0;
  const current = state.active
    .filter(isSupervisedAutonomyJob)
    .sort((a, b) => Number(a.created_at || 0) - Number(b.created_at || 0))[0] || null;

  return {
    ok: true,
    schema: 'mel.autonomy-readiness',
    version: 2,
    evaluated_at: new Date().toISOString(),
    status: ready ? 'SELF_DEVELOPMENT_READY' : 'BUILDING_AUTONOMY',
    self_development_ready: ready,
    gates,
    blockers,
    evidence: {
      live_council_zero_cost: council,
      runtime_work_dag_resume: workDag,
      runtime_teacher_round_trip: teacherRoundTrip,
      mel_multi_ai_implementation_plan: implementationPlan,
      ci_verified_candidate_completion: completion,
    },
    jobs: {
      supervised_total: jobs.length,
      active_count: state.active.filter(isSupervisedAutonomyJob).length,
      completed_roadmap_ids: state.completedIds,
      blocked_roadmap_ids: state.blockedIds,
      current: current ? {
        job_id: current.id,
        requested_by: current.requested_by,
        status: current.status,
        roadmap_id: current.optional_context?.roadmap_id || null,
        teacher_request_id: current.result_json?.teacher_bridge?.request?.request_id || null,
        implementation_proposal_ready: current.result_json?.implementation_proposal?.status === 'READY',
      } : null,
      next_roadmap_item: state.next ? {
        id: state.next.id,
        title: state.next.title,
        priority: state.next.priority,
        status: state.next.status,
      } : null,
    },
    next_action: ready
      ? 'CONTINUE_ROADMAP_WITH_SUPERVISED_AUTONOMY'
      : blockers[0],
    invariants: {
      candidate_only: true,
      zero_added_cost_fail_closed: true,
      production_deploy_requires_separate_authorization: true,
      owner_shutdown_wins: true,
    },
  };
}

const SHA40 = /^[0-9a-f]{40}$/i;

function upper(value) {
  return String(value || '').toUpperCase();
}

function cloneObject(value) {
  return value && typeof value === 'object' ? { ...value } : {};
}

function archiveBridge(result, state, extra = {}) {
  if (!state) return;
  const history = Array.isArray(result.teacher_bridge_history) ? [...result.teacher_bridge_history] : [];
  history.push({ ...state, ...extra });
  result.teacher_bridge_history = history.slice(-20);
}

async function requeueStaleTeacher(repository, job, canonicalSha) {
  const bridge = job?.result_json?.teacher_bridge;
  const request = bridge?.request || {};
  const targetSha = String(request.target_sha || request?.candidate?.sha || '').toLowerCase();
  if (upper(job?.status) !== 'WAITING_TEACHER' || bridge?.status !== 'WAITING_TEACHER') return null;
  if (!SHA40.test(canonicalSha) || !SHA40.test(targetSha) || targetSha === canonicalSha.toLowerCase()) return null;

  const now = new Date().toISOString();
  const result = cloneObject(job.result_json);
  archiveBridge(result, bridge, {
    status: 'STALE',
    stale_at: now,
    stale_reason: 'CANDIDATE_SHA_DRIFT_DEPLOYED_SHA',
    stale_request_sha: targetSha,
    current_candidate_sha: canonicalSha,
  });
  result.last_teacher_stale = {
    request_id: request.request_id || null,
    previous_target_sha: targetSha,
    current_candidate_sha: canonicalSha,
    stale_at: now,
    source: 'passive-state-recovery',
  };
  result.teacher_bridge = null;
  delete result.implementation_proposal;
  delete result.bridge_package;

  const plan = cloneObject(job.plan_json);
  plan.preflight = null;
  plan.revision = {
    requested_at: now,
    previous_request_id: request.request_id || null,
    previous_target_sha: targetSha,
    current_candidate_sha: canonicalSha,
    reason: 'TEACHER_REQUEST_STALE_SHA',
  };

  const updated = await repository.update(job.id, {
    status: 'QUEUED',
    plan_json: plan,
    result_json: result,
    error: null,
  });
  return { job_id: updated.id, from: 'WAITING_TEACHER', to: 'QUEUED', reason: 'STALE_CANDIDATE_SHA' };
}

async function requeueOrphanReview(repository, job) {
  if (upper(job?.status) !== 'READY_FOR_REVIEW') return null;
  if (job?.result_json?.dev_bridge?.needs_repair === true) return null;
  const teacher = job?.result_json?.teacher_bridge;
  const devBridge = job?.result_json?.dev_bridge;
  const hasAnsweredTeacher = teacher?.status === 'ANSWERED'
    && teacher?.review?.verdict === 'APPROVE_PLAN'
    && teacher?.review?.development_allowed === true;
  const hasReviewPackage = devBridge?.status === 'READY_FOR_REVIEW';
  if (hasAnsweredTeacher && hasReviewPackage) return null;

  const now = new Date().toISOString();
  const result = cloneObject(job.result_json);
  archiveBridge(result, teacher, {
    status: teacher?.status || 'MISSING',
    orphaned_at: now,
    orphaned_reason: 'READY_FOR_REVIEW_WITHOUT_COMPLETE_TEACHER_CHAIN',
  });
  if (!hasAnsweredTeacher) result.teacher_bridge = null;
  delete result.implementation_proposal;
  delete result.bridge_package;
  result.passive_state_recovery = {
    recovered_at: now,
    previous_status: 'READY_FOR_REVIEW',
    reason: hasAnsweredTeacher ? 'DEV_BRIDGE_REVIEW_PACKAGE_MISSING' : 'TEACHER_APPROVAL_MISSING',
  };

  const plan = cloneObject(job.plan_json);
  plan.preflight = null;
  plan.revision = {
    requested_at: now,
    previous_request_id: teacher?.request?.request_id || teacher?.review?.request_id || null,
    reason: 'ORPHAN_READY_FOR_REVIEW_RECOVERY',
  };

  const updated = await repository.update(job.id, {
    status: 'QUEUED',
    plan_json: plan,
    result_json: result,
    error: null,
  });
  return { job_id: updated.id, from: 'READY_FOR_REVIEW', to: 'QUEUED', reason: result.passive_state_recovery.reason };
}

export async function recoverPassiveRuntimeStates(repository, { canonicalSha = null, limit = 100 } = {}) {
  if (!repository || typeof repository.list !== 'function' || typeof repository.update !== 'function') {
    throw Object.assign(new Error('PASSIVE_RECOVERY_REPOSITORY_REQUIRED'), { code: 'PASSIVE_RECOVERY_REPOSITORY_REQUIRED' });
  }
  const jobs = await repository.list();
  const recovered = [];
  const failed = [];
  for (const job of jobs.slice(0, Math.max(1, Math.min(500, Number(limit) || 100)))) {
    try {
      const stale = await requeueStaleTeacher(repository, job, String(canonicalSha || '').toLowerCase());
      if (stale) { recovered.push(stale); continue; }
      const orphan = await requeueOrphanReview(repository, job);
      if (orphan) recovered.push(orphan);
    } catch (error) {
      failed.push({ job_id: job?.id || null, code: error?.code || error?.message || 'PASSIVE_RECOVERY_FAILED' });
    }
  }
  return { attempted: jobs.length, recovered, failed, canonical_sha: SHA40.test(String(canonicalSha || '')) ? canonicalSha : null };
}

export { requeueStaleTeacher, requeueOrphanReview };

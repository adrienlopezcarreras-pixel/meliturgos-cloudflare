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
  const exhaustedApproval = upper(job?.status) === 'TEACHER_APPROVED'
    && bridge?.status === 'ANSWERED' && bridge?.review?.development_allowed === true
    && bridge?.review?.verdict === 'APPROVE_PLAN'
    && job?.result_json?.autonomy_deferral?.exhausted === true;
  if (!exhaustedApproval && (upper(job?.status) !== 'WAITING_TEACHER' || bridge?.status !== 'WAITING_TEACHER')) return null;
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
  if (exhaustedApproval) delete result.autonomy_deferral;

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
  }, { expected: job });
  // Clearing the list may CANCEL this job between the read and the update.
  // D1 deliberately keeps CANCELLED terminal; never report it as requeued.
  if (upper(updated?.status) !== 'QUEUED') return null;
  return { job_id: updated.id, from: upper(job.status), to: 'QUEUED', reason: 'STALE_CANDIDATE_SHA' };
}

async function requeueOrphanReview(repository, job, now = Date.now()) {
  if (upper(job?.status) !== 'READY_FOR_REVIEW') return null;
  if (job?.result_json?.dev_bridge?.needs_repair === true) return null;
  const teacher = job?.result_json?.teacher_bridge;
  const devBridge = job?.result_json?.dev_bridge;
  const hasAnsweredTeacher = teacher?.status === 'ANSWERED'
    && teacher?.review?.verdict === 'APPROVE_PLAN'
    && teacher?.review?.development_allowed === true;
  const hasReviewPackage = devBridge?.status === 'READY_FOR_REVIEW';
  const packageReady = job?.result_json?.bridge_preparation?.status === 'READY'
    && job?.result_json?.implementation_proposal?.status === 'READY';
  const ageMs = now - Number(job?.updated_at || 0);
  const undispatchable = hasAnsweredTeacher && hasReviewPackage && !packageReady
    && Number(job?.updated_at || 0) > 0 && ageMs > 6 * 60 * 60 * 1000;
  if (hasAnsweredTeacher && hasReviewPackage && !undispatchable) return null;

  const observedAt = new Date().toISOString();
  const result = cloneObject(job.result_json);
  if (undispatchable) {
    delete result.implementation_proposal;
    delete result.bridge_package;
    delete result.bridge_preparation;
    result.passive_state_recovery = {
      recovered_at: observedAt,
      previous_status: 'READY_FOR_REVIEW',
      reason: 'REVIEW_NOT_DISPATCHABLE',
    };
    const updated = await repository.update(job.id, {
      status: 'TEACHER_APPROVED',
      result_json: result,
      error: null,
    }, { expected: job });
    if (upper(updated?.status) !== 'TEACHER_APPROVED') return null;
    return { job_id: updated.id, from: 'READY_FOR_REVIEW', to: 'TEACHER_APPROVED', reason: 'REVIEW_NOT_DISPATCHABLE' };
  }
  archiveBridge(result, teacher, {
    status: teacher?.status || 'MISSING',
    orphaned_at: observedAt,
    orphaned_reason: 'READY_FOR_REVIEW_WITHOUT_COMPLETE_TEACHER_CHAIN',
  });
  if (!hasAnsweredTeacher) result.teacher_bridge = null;
  delete result.implementation_proposal;
  delete result.bridge_package;
  result.passive_state_recovery = {
    recovered_at: observedAt,
    previous_status: 'READY_FOR_REVIEW',
    reason: !hasAnsweredTeacher ? 'TEACHER_APPROVAL_MISSING'
      : undispatchable ? 'REVIEW_NOT_DISPATCHABLE'
      : 'DEV_BRIDGE_REVIEW_PACKAGE_MISSING',
  };

  const plan = cloneObject(job.plan_json);
  plan.preflight = null;
  plan.revision = {
    requested_at: observedAt,
    previous_request_id: teacher?.request?.request_id || teacher?.review?.request_id || null,
    reason: 'ORPHAN_READY_FOR_REVIEW_RECOVERY',
  };

  const updated = await repository.update(job.id, {
    status: 'QUEUED',
    plan_json: plan,
    result_json: result,
    error: null,
  }, { expected: job });
  if (upper(updated?.status) !== 'QUEUED') return null;
  return { job_id: updated.id, from: 'READY_FOR_REVIEW', to: 'QUEUED', reason: result.passive_state_recovery.reason };
}

export async function recoverPassiveRuntimeStates(repository, { canonicalSha = null, limit = 100, now = Date.now(), activeOnly = false, onlyJobId = null } = {}) {
  if (!repository || typeof repository.list !== 'function' || typeof repository.update !== 'function') {
    throw Object.assign(new Error('PASSIVE_RECOVERY_REPOSITORY_REQUIRED'), { code: 'PASSIVE_RECOVERY_REPOSITORY_REQUIRED' });
  }
  // The general D1 list is a 100-row UI window. Fetch all active autonomy
  // jobs separately so older, non-cancelled work is not invisible
  // to hourly passive recovery. This does not start or authorize MAX.
  const activeAutonomyJobs = typeof repository.listActiveAutonomyJobs === 'function'
    ? await repository.listActiveAutonomyJobs()
    : [];
  const recentJobs = activeOnly ? [] : await repository.list();
  const allJobs = new Map();
  for (const job of [...activeAutonomyJobs, ...recentJobs]) {
    if (job?.id && !allJobs.has(job.id)) allJobs.set(job.id, job);
  }
  const recovered = [];
  const failed = [];
  // Prioritize relevant states before applying the maintenance limit.
  const candidates = [...allJobs.values()].filter(job =>
    (!onlyJobId || job?.id === onlyJobId) &&
    ['READY_FOR_REVIEW', 'WAITING_TEACHER', 'TEACHER_APPROVED'].includes(upper(job?.status)));
  for (const job of candidates.slice(0, Math.max(1, Math.min(500, Number(limit) || 100)))) {
    try {
      const stale = await requeueStaleTeacher(repository, job, String(canonicalSha || '').toLowerCase());
      if (stale) { recovered.push(stale); continue; }
      const orphan = await requeueOrphanReview(repository, job, now);
      if (orphan) recovered.push(orphan);
    } catch (error) {
      failed.push({ job_id: job?.id || null, code: error?.code || error?.message || 'PASSIVE_RECOVERY_FAILED' });
    }
  }
  return { attempted: allJobs.size, recovered, failed, canonical_sha: SHA40.test(String(canonicalSha || '')) ? canonicalSha : null };
}

export { requeueStaleTeacher, requeueOrphanReview };

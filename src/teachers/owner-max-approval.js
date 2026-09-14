const SHA40 = /^[0-9a-f]{40}$/i;

function cleanText(value, max = 1200) {
  return String(value ?? '').trim().slice(0, max);
}

export async function applyOwnerMaxApproval(repository, jobId, { source = 'owner-max-runtime' } = {}) {
  if (!repository || !jobId) {
    throw Object.assign(new Error('OWNER_MAX_INPUT_REQUIRED'), { code: 'OWNER_MAX_INPUT_REQUIRED' });
  }

  const job = await repository.get(jobId);
  if (!job) throw Object.assign(new Error('JOB_NOT_FOUND'), { code: 'JOB_NOT_FOUND', status: 404 });

  const bridge = job?.result_json?.teacher_bridge;
  if (bridge?.status === 'ANSWERED' && bridge?.review?.development_allowed === true) {
    return { job, duplicate: true, review: bridge.review };
  }
  if (String(job.status || '').toUpperCase() !== 'WAITING_TEACHER' || bridge?.status !== 'WAITING_TEACHER') {
    throw Object.assign(new Error('OWNER_MAX_TEACHER_REQUEST_REQUIRED'), { code: 'OWNER_MAX_TEACHER_REQUEST_REQUIRED', status: 409 });
  }

  const request = bridge.request || {};
  const requestId = cleanText(request.request_id, 300);
  const targetSha = cleanText(request.target_sha, 80).toLowerCase();
  const candidateSha = cleanText(request?.candidate?.sha, 80).toLowerCase();
  const evidenceSha = cleanText(bridge?.evidence?.candidate_sha, 80).toLowerCase();
  const candidateBranch = cleanText(request?.candidate?.branch, 300);
  const councilComplete = request?.provenance?.source === 'MEL_RUNTIME_CRON'
    || request?.stage === 'TEACHER_REVIEW_REQUIRED'
    || Array.isArray(request?.requested_review);
  const shaCorrelated = SHA40.test(targetSha)
    && SHA40.test(candidateSha)
    && targetSha === candidateSha
    && (!evidenceSha || (SHA40.test(evidenceSha) && evidenceSha === candidateSha));

  if (!requestId || !shaCorrelated || !candidateBranch.startsWith('candidate/') || !councilComplete) {
    throw Object.assign(new Error('OWNER_MAX_PREFLIGHT_EVIDENCE_REQUIRED'), { code: 'OWNER_MAX_PREFLIGHT_EVIDENCE_REQUIRED', status: 422 });
  }

  const reviewedAt = new Date().toISOString();
  const review = {
    type: 'MEL_TEACHER_REVIEW',
    request_id: requestId,
    target_sha: targetSha,
    verdict: 'APPROVE_PLAN',
    development_allowed: true,
    feedback: 'Autorisation propriétaire MAX pour poursuivre le développement interne sur la branche candidate après Council et inspection. Aucune publication production n’est autorisée par cette dérogation.',
    evidence: ['OWNER_MAX_AUTONOMY', 'COUNCIL_PREFLIGHT_PRESENT', 'CANDIDATE_ONLY', 'PRODUCTION_RELEASE_STILL_GATED'],
    reviewed_at: reviewedAt,
    source: cleanText(source, 100) || 'owner-max-runtime',
    owner_override: true,
  };

  const result = job.result_json && typeof job.result_json === 'object' ? { ...job.result_json } : {};
  result.teacher_bridge = {
    ...bridge,
    status: 'ANSWERED',
    review,
    reviewed_at: reviewedAt,
  };
  result.last_teacher_review = {
    request_id: requestId,
    target_sha: targetSha,
    verdict: review.verdict,
    feedback: review.feedback,
    evidence: review.evidence,
    reviewed_at: reviewedAt,
    source: review.source,
    owner_override: true,
  };
  result.owner_max_autonomy = {
    applied: true,
    applied_at: reviewedAt,
    request_id: requestId,
    target_sha: targetSha,
    candidate_branch: candidateBranch,
    production_release_allowed: false,
  };

  const updated = await repository.update(job.id, {
    status: 'TEACHER_APPROVED',
    result_json: result,
    error: null,
  });
  return { job: updated, duplicate: false, review };
}

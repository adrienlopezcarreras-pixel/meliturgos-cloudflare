// An exhausted provider attempt is a preserved, non-runnable mission, not a
// successful implementation or permission to make a fourth identical call.
// Only a matching approved context and a completed, unclaimed preparation phase
// can yield the single execution slot to the next roadmap mission.
export function providerRetryContext(job) {
  const result = job?.result_json || {};
  return JSON.stringify([job?.candidate_branch || null,
    result.teacher_bridge?.review?.target_sha || null,
    result.teacher_bridge?.review?.request_id || null,
    result.implementation_proposal?.candidate_sha || null,
    result.implementation_proposal?.teacher_request_id || null]);
}

export function isRotatableProviderExhaustion(job) {
  if (job?.requested_by !== 'mel-autonomy') return false;
  if (!['QUEUED', 'TEACHER_APPROVED'].includes(String(job?.status || '').toUpperCase())) return false;
  const delay = job?.result_json?.autonomy_deferral;
  if (delay?.exhausted !== true || !['implementation', 'bridge'].includes(delay.phase)) return false;
  if (!Number.isFinite(Number(delay.attempts)) || Number(delay.attempts) < 3
      || !Number.isFinite(Number(delay.max_attempts)) || Number(delay.max_attempts) < 3) return false;
  // Never free a lane for a stale or absent context, where an old deferral
  // might otherwise conceal a newly approved job.
  if (typeof delay.context !== 'string' || delay.context !== providerRetryContext(job)) return false;
  const bridge = String(job?.result_json?.dev_bridge?.status || '').toUpperCase();
  if (['RUNNING', 'IN_PROGRESS', 'CLAIMED', 'READY_FOR_REVIEW'].includes(bridge)) return false;
  return true;
}

// Mirror the JS guard in D1's atomic INSERT admission predicate. The matching
// context is computed by SQLite from the same five persisted fields, so a
// changed SHA/request cannot bypass the single-flight fence.
export const ROTATABLE_PROVIDER_EXHAUSTION_SQL = `(
  status IN ('QUEUED','TEACHER_APPROVED')
  AND json_extract(result_json,'$.autonomy_deferral.exhausted') = 1
  AND json_extract(result_json,'$.autonomy_deferral.phase') IN ('implementation','bridge')
  AND json_extract(result_json,'$.autonomy_deferral.attempts') >= 3
  AND json_extract(result_json,'$.autonomy_deferral.max_attempts') >= 3
  AND json_type(result_json,'$.autonomy_deferral.context') = 'text'
  AND json_extract(result_json,'$.autonomy_deferral.context') = json_array(
    candidate_branch,
    json_extract(result_json,'$.teacher_bridge.review.target_sha'),
    json_extract(result_json,'$.teacher_bridge.review.request_id'),
    json_extract(result_json,'$.implementation_proposal.candidate_sha'),
    json_extract(result_json,'$.implementation_proposal.teacher_request_id')
  )
  AND COALESCE(json_extract(result_json,'$.dev_bridge.status'),'') NOT IN
    ('RUNNING','IN_PROGRESS','CLAIMED','READY_FOR_REVIEW')
)`;

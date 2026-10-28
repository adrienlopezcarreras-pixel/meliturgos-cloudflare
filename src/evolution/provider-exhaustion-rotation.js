import { COUNCIL_INFERENCE_POLICY, staleCouncilDeferral } from '../teachers/council-inference-policy.js';
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
  if (job?.requested_by !== 'mel-autonomy' || staleCouncilDeferral(job)) return false;
  if (!['QUEUED', 'TEACHER_APPROVED'].includes(String(job?.status || '').toUpperCase())) return false;
  const delay = job?.result_json?.autonomy_deferral;
  if (delay?.exhausted !== true || !['implementation', 'bridge', 'council'].includes(delay.phase)) return false;
  if (!Number.isFinite(Number(delay.attempts)) || Number(delay.attempts) < 3
      || !Number.isFinite(Number(delay.max_attempts)) || Number(delay.max_attempts) < 3
      || Number(delay.attempts) < Number(delay.max_attempts)) return false;
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
  AND (json_extract(result_json,'$.autonomy_deferral.phase') != 'council'
    OR json_extract(result_json,'$.autonomy_deferral.inference_policy') = '${COUNCIL_INFERENCE_POLICY}')
  AND json_extract(result_json,'$.autonomy_deferral.exhausted') = 1
  AND json_extract(result_json,'$.autonomy_deferral.phase') IN ('implementation','bridge','council')
  AND json_extract(result_json,'$.autonomy_deferral.attempts') >= 3
  AND json_extract(result_json,'$.autonomy_deferral.max_attempts') >= 3
  AND json_extract(result_json,'$.autonomy_deferral.attempts') >=
      json_extract(result_json,'$.autonomy_deferral.max_attempts')
  AND json_type(result_json,'$.autonomy_deferral.context') = 'text'
  AND json_extract(result_json,'$.autonomy_deferral.context') = json_array(
    candidate_branch,
    json_extract(result_json,'$.teacher_bridge.review.target_sha'),
    json_extract(result_json,'$.teacher_bridge.review.request_id'),
    json_extract(result_json,'$.implementation_proposal.candidate_sha'),
    json_extract(result_json,'$.implementation_proposal.teacher_request_id')
  )
  AND UPPER(COALESCE(json_extract(result_json,'$.dev_bridge.status'),'')) NOT IN
    ('RUNNING','IN_PROGRESS','CLAIMED','READY_FOR_REVIEW')
)`;

/**
 * A Council review that cannot reach an authorized provider is still a failed
 * scheduling attempt. Count one *eligible* review window, not heartbeat polls
 * or the number of model calls. This prevents zero-provider outages from
 * retaining a permanent D1 single-flight lock.
 */
export function boundedCouncilDeferral({ job, deferred, retryAt, freshAttempts = [], now = Date.now() } = {}) {
  const context = providerRetryContext(job);
  const previous = job?.result_json?.autonomy_deferral;
  const sameContext = previous?.phase === 'council' && previous?.context === context && !staleCouncilDeferral(job);
  const previousRounds = sameContext
    ? Math.max(0, Math.min(3, Number(previous.attempts) || 0)) : 0;
  const previousRetryAt = Number(previous?.retry_after);
  const stillInWindow = sameContext && Number.isFinite(previousRetryAt)
    && previousRetryAt > now;
  const attempts = Math.min(3, previousRounds + (stillInWindow ? 0 : 1));
  const invokedAndFailed = Array.isArray(freshAttempts)
    && freshAttempts.some(row => ['FAILED', 'TIMEOUT'].includes(String(row?.status || '').toUpperCase()));
  // Existing proofs and model failure traces stay with the original job;
  // this marker explains whether a counted round actually invoked a model.
  return { ...deferred, phase: 'council', context, inference_policy: COUNCIL_INFERENCE_POLICY,
    attempts, max_attempts: 3, exhausted: attempts >= 3,
    priority_penalty: Math.max(0, Number(previous?.priority_penalty) || 0) + (attempts >= 3 && previous?.exhausted !== true ? 1 : 0),
    last_round: stillInWindow ? previous?.last_round || 'WINDOW_PENDING'
      : (invokedAndFailed ? 'PROVIDER_FAILURE' : 'NO_ELIGIBLE_PROVIDER_WINDOW'),
    retry_after: stillInWindow ? previousRetryAt : retryAt };
}

// A queue entry is not an executing mission. Match the single-flight scheduler.
export function activeAutonomyMission(jobs = []) {
  return jobs.filter(job => job?.requested_by === 'mel-autonomy'
    && String(job.status || '').toUpperCase() !== 'QUEUED'
    && !['COMPLETED','CANCELLED','FAILED','DONE','DONE_VERIFIED','VERIFIED','ACCEPTED'].includes(String(job.status).toUpperCase())
    && !isRotatableProviderExhaustion(job))
    .sort((a,b)=>Number(Boolean(a.result_json?.autonomy_deferral?.exhausted && a.result_json.autonomy_deferral.context !== providerRetryContext(a)))
      - Number(Boolean(b.result_json?.autonomy_deferral?.exhausted && b.result_json.autonomy_deferral.context !== providerRetryContext(b)))
      || Number(a.created_at||0)-Number(b.created_at||0)||String(a.id).localeCompare(String(b.id)))[0] || null;
}

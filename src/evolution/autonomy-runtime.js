import { runAutonomyRuntimeTick as runCoreAutonomyRuntimeTick } from './autonomy-runtime-core.js';
import { getAutonomyControl } from './autonomy-control.js';
import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import { applyOwnerMaxApproval } from '../teachers/owner-max-approval.js';

export * from './autonomy-runtime-core.js';

const CANONICAL_CANDIDATE_BRANCH = 'candidate/mel-clean-autonomy';

// Delegated core invariant remains unchanged inside autonomy-runtime-core.js:
// reconcileRuntimeTeacherReplies -> reconcileRuntimeCompletions -> ensureNextJob()
// -> prepareAutonomyTeacherRequest -> prepareApprovedImplementationProposal.
// Emergency pause always wins. MAX autonomy may only bypass a missing Teacher
// after the normal Council + code-inspection request exists. It never promotes
// or deploys production; the release pipeline remains separately gated.
export async function runAutonomyRuntimeTick(env, options = {}) {
  const control = await getAutonomyControl(env?.DB);
  if (control.paused) {
    return {
      status: 'PAUSED',
      paused: true,
      advanced: false,
      candidate_branch: env?.MEL_GITHUB_BRANCH || CANONICAL_CANDIDATE_BRANCH,
      control,
    };
  }

  const first = await runCoreAutonomyRuntimeTick(env, options);
  if (!control.max_autonomy || String(first?.job?.status || '').toUpperCase() !== 'WAITING_TEACHER' || !first?.job?.id) {
    return { ...first, control, owner_max_applied: false };
  }

  const repository = options.repository || new D1DevJobRepository(env.DB);
  try {
    await applyOwnerMaxApproval(repository, first.job.id, { source: 'owner-max-runtime' });
  } catch (error) {
    return {
      ...first,
      control,
      owner_max_applied: false,
      owner_max_error: error?.code || error?.message || 'OWNER_MAX_APPROVAL_FAILED',
    };
  }

  const second = await runCoreAutonomyRuntimeTick(env, { ...options, repository });
  return {
    ...second,
    control,
    owner_max_applied: true,
    owner_max_bypassed_stage: 'WAITING_TEACHER',
    production_release_allowed: false,
  };
}

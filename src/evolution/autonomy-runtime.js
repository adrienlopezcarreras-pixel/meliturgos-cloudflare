import { runAutonomyRuntimeTick as runCoreAutonomyRuntimeTick } from './autonomy-runtime-core.js';
import { getAutonomyControl } from './autonomy-control.js';

export * from './autonomy-runtime-core.js';

const CANONICAL_CANDIDATE_BRANCH = 'candidate/mel-clean-autonomy';

// Delegated core invariant: reconcileRuntimeTeacherReplies ->
// reconcileRuntimeCompletions -> ensureNextJob() -> prepareAutonomyTeacherRequest ->
// prepareApprovedImplementationProposal. The emergency gate runs before that chain.
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
  return runCoreAutonomyRuntimeTick(env, options);
}

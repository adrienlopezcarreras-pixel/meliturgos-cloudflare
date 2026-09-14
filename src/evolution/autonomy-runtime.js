import { runAutonomyRuntimeTick as runCoreAutonomyRuntimeTick } from './autonomy-runtime-core.js';
import { getAutonomyControl } from './autonomy-control.js';
import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import { applyOwnerMaxApproval } from '../teachers/owner-max-approval.js';
import { mirrorAllWaitingOwnerChatTeachers } from '../teachers/owner-chat-teacher-mirror.js';

export * from './autonomy-runtime-core.js';

const CANONICAL_CANDIDATE_BRANCH = 'candidate/mel-clean-autonomy';

function waitingTeacher(job) {
  return String(job?.status || '').toUpperCase() === 'WAITING_TEACHER'
    && job?.result_json?.teacher_bridge?.status === 'WAITING_TEACHER';
}

export async function approveAllWaitingTeachersUnderOwnerMax(repository, { source = 'owner-max-runtime', limit = 50 } = {}) {
  if (!repository || typeof repository.list !== 'function') {
    throw Object.assign(new Error('OWNER_MAX_REPOSITORY_REQUIRED'), { code: 'OWNER_MAX_REPOSITORY_REQUIRED' });
  }
  const jobs = await repository.list();
  const waiting = jobs.filter(waitingTeacher).slice(0, Math.max(1, Math.min(100, Number(limit) || 50)));
  const applied = [];
  const failed = [];

  for (const job of waiting) {
    try {
      const result = await applyOwnerMaxApproval(repository, job.id, { source });
      applied.push({
        job_id: job.id,
        request_id: result?.review?.request_id || job?.result_json?.teacher_bridge?.request?.request_id || null,
      });
    } catch (error) {
      failed.push({
        job_id: job.id,
        code: error?.code || error?.message || 'OWNER_MAX_APPROVAL_FAILED',
      });
    }
  }

  return { attempted: waiting.length, applied, failed };
}

// Delegated core invariant remains unchanged inside autonomy-runtime-core.js:
// reconcileRuntimeTeacherReplies -> reconcileRuntimeCompletions -> ensureNextJob()
// -> prepareAutonomyTeacherRequest -> prepareApprovedImplementationProposal.
// Emergency pause always wins. In normal mode every owner-chat WAITING_TEACHER
// request is mirrored to the Teacher transport instead of becoming invisible.
// In explicit MAX mode every valid pending Teacher request is advanced after
// Council + candidate inspection; production promotion remains separately gated.
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

  const repository = options.repository || new D1DevJobRepository(env.DB);
  const coreOptions = { ...options, repository };
  const first = await runCoreAutonomyRuntimeTick(env, coreOptions);

  let ownerChatTeacherMirror = null;
  try {
    ownerChatTeacherMirror = await mirrorAllWaitingOwnerChatTeachers({
      env,
      repository,
      fetchImpl: options.fetchImpl || fetch,
    });
  } catch (error) {
    ownerChatTeacherMirror = {
      attempted: 0,
      mirrored: [],
      failed: [{ job_id: null, code: error?.code || error?.message || 'OWNER_CHAT_TEACHER_MIRROR_FAILED' }],
    };
  }

  if (!control.max_autonomy) {
    return {
      ...first,
      control,
      owner_chat_teacher_mirror: ownerChatTeacherMirror,
      owner_max_applied: false,
    };
  }

  let ownerMaxSweep;
  try {
    ownerMaxSweep = await approveAllWaitingTeachersUnderOwnerMax(repository, { source: 'owner-max-runtime' });
  } catch (error) {
    return {
      ...first,
      control,
      owner_chat_teacher_mirror: ownerChatTeacherMirror,
      owner_max_applied: false,
      owner_max_error: error?.code || error?.message || 'OWNER_MAX_APPROVAL_FAILED',
    };
  }

  if (!ownerMaxSweep.applied.length) {
    return {
      ...first,
      control,
      owner_chat_teacher_mirror: ownerChatTeacherMirror,
      owner_max_applied: false,
      owner_max_sweep: ownerMaxSweep,
    };
  }

  const second = await runCoreAutonomyRuntimeTick(env, coreOptions);
  return {
    ...second,
    control,
    owner_chat_teacher_mirror: ownerChatTeacherMirror,
    owner_max_applied: true,
    owner_max_sweep: ownerMaxSweep,
    owner_max_bypassed_stage: 'WAITING_TEACHER',
    production_release_allowed: false,
  };
}

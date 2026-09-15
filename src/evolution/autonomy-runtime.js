import { runAutonomyRuntimeTick as runCoreAutonomyRuntimeTick } from './autonomy-runtime-core.js';
import { getAutonomyControl } from './autonomy-control.js';
import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import { applyOwnerMaxApproval } from '../teachers/owner-max-approval.js';
import { mirrorRuntimeTeacherRequestToGitHub } from '../teachers/github-request-mirror.js';
import { mirrorAllWaitingOwnerChatTeachers } from '../teachers/owner-chat-teacher-mirror.js';
import { recoverPassiveRuntimeStates } from './passive-state-recovery.js';
import { retireObsoleteQueueJobs } from './queue-hygiene.js';

export * from './autonomy-runtime-core.js';

const CANONICAL_CANDIDATE_BRANCH = 'candidate/mel-clean-autonomy';

function deployedCandidateSha() {
  try {
    return typeof MEL_DEPLOYED_GIT_SHA !== 'undefined' ? String(MEL_DEPLOYED_GIT_SHA || '') : '';
  } catch {
    return '';
  }
}

function waitingTeacher(job) {
  return String(job?.status || '').toUpperCase() === 'WAITING_TEACHER'
    && job?.result_json?.teacher_bridge?.status === 'WAITING_TEACHER';
}

function internalWaitingTeacher(job) {
  return job?.requested_by === 'mel-autonomy' && waitingTeacher(job);
}

export async function mirrorAllWaitingInternalTeachers({ env = {}, repository, fetchImpl = fetch, limit = 50 } = {}) {
  if (!repository || typeof repository.list !== 'function') {
    throw Object.assign(new Error('INTERNAL_TEACHER_REPOSITORY_REQUIRED'), { code: 'INTERNAL_TEACHER_REPOSITORY_REQUIRED' });
  }
  const jobs = await repository.list();
  const waiting = jobs.filter(internalWaitingTeacher).slice(0, Math.max(1, Math.min(100, Number(limit) || 50)));
  const mirrored = [];
  const failed = [];

  for (const job of waiting) {
    try {
      const result = await mirrorRuntimeTeacherRequestToGitHub({
        env,
        job,
        state: job.result_json.teacher_bridge,
        fetchImpl,
      });
      const row = {
        job_id: job.id,
        request_id: job.result_json.teacher_bridge?.request?.request_id || null,
        status: result.status,
        path: result.path || null,
      };
      if (result.status === 'FAILED' || String(result.status || '').startsWith('SKIPPED_NO_')) failed.push({ ...row, code: result.code || result.status });
      else mirrored.push(row);
    } catch (error) {
      failed.push({
        job_id: job.id,
        request_id: job.result_json.teacher_bridge?.request?.request_id || null,
        code: error?.code || error?.message || 'INTERNAL_TEACHER_MIRROR_FAILED',
      });
    }
  }

  return { attempted: waiting.length, mirrored, failed };
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

// One heartbeat first retires queue entries that are explicitly obsolete or
// recovered legacy owner work with no fresh progress. These rows are archived
// as CANCELLED, never deleted, so the active queue stays truthful without
// losing traceability. Then the normal Teacher/completion reconciliation runs.
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

  let queueHygiene = null;
  try {
    queueHygiene = await retireObsoleteQueueJobs(repository, { limit: 200 });
  } catch (error) {
    queueHygiene = {
      attempted: 0,
      retired: [],
      failed: [{ job_id: null, code: error?.code || error?.message || 'QUEUE_HYGIENE_FAILED' }],
      policy: 'archive-not-delete',
    };
  }

  let passiveRecovery = null;
  try {
    passiveRecovery = await recoverPassiveRuntimeStates(repository, {
      canonicalSha: deployedCandidateSha(),
      limit: 200,
    });
  } catch (error) {
    passiveRecovery = {
      attempted: 0,
      recovered: [],
      failed: [{ job_id: null, code: error?.code || error?.message || 'PASSIVE_RECOVERY_FAILED' }],
      canonical_sha: deployedCandidateSha() || null,
    };
  }

  const coreOptions = { ...options, repository };
  const first = await runCoreAutonomyRuntimeTick(env, coreOptions);

  let internalTeacherMirror = null;
  try {
    internalTeacherMirror = await mirrorAllWaitingInternalTeachers({
      env,
      repository,
      fetchImpl: options.fetchImpl || fetch,
    });
  } catch (error) {
    internalTeacherMirror = {
      attempted: 0,
      mirrored: [],
      failed: [{ job_id: null, code: error?.code || error?.message || 'INTERNAL_TEACHER_MIRROR_FAILED' }],
    };
  }

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
      queue_hygiene: queueHygiene,
      passive_recovery: passiveRecovery,
      internal_teacher_mirror: internalTeacherMirror,
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
      queue_hygiene: queueHygiene,
      passive_recovery: passiveRecovery,
      internal_teacher_mirror: internalTeacherMirror,
      owner_chat_teacher_mirror: ownerChatTeacherMirror,
      owner_max_applied: false,
      owner_max_error: error?.code || error?.message || 'OWNER_MAX_APPROVAL_FAILED',
    };
  }

  if (!ownerMaxSweep.applied.length) {
    return {
      ...first,
      control,
      queue_hygiene: queueHygiene,
      passive_recovery: passiveRecovery,
      internal_teacher_mirror: internalTeacherMirror,
      owner_chat_teacher_mirror: ownerChatTeacherMirror,
      owner_max_applied: false,
      owner_max_sweep: ownerMaxSweep,
    };
  }

  const second = await runCoreAutonomyRuntimeTick(env, coreOptions);
  return {
    ...second,
    control,
    queue_hygiene: queueHygiene,
    passive_recovery: passiveRecovery,
    internal_teacher_mirror: internalTeacherMirror,
    owner_chat_teacher_mirror: ownerChatTeacherMirror,
    owner_max_applied: true,
    owner_max_sweep: ownerMaxSweep,
    owner_max_bypassed_stage: 'WAITING_TEACHER',
    production_release_allowed: false,
  };
}

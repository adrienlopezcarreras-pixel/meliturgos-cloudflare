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
const ACTIONABLE_FAILURE_STATES = new Set(['QUEUED', 'CLAIMED', 'COUNCIL_COMPLETE', 'TEACHER_APPROVED']);
const FATAL_RUNTIME_CONFIGURATION_ERRORS = new Set([
  'AUTONOMY_BRANCH_NOT_CANDIDATE',
  'TEACHER_BRANCH_NOT_CANDIDATE',
  'AUTONOMY_CANDIDATE_BRANCH_DIVERGENCE',
]);

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

function supervised(job) {
  return job?.requested_by === 'owner-chat' || job?.requested_by === 'mel-autonomy';
}

function failureCandidateSort(a, b) {
  const ownerA = a?.requested_by === 'owner-chat' ? 0 : 1;
  const ownerB = b?.requested_by === 'owner-chat' ? 0 : 1;
  return ownerA - ownerB || Number(a?.created_at || 0) - Number(b?.created_at || 0) || String(a?.id || '').localeCompare(String(b?.id || ''));
}

function mustFailClosed(error) {
  return FATAL_RUNTIME_CONFIGURATION_ERRORS.has(String(error?.code || error?.message || '').toUpperCase());
}

async function recordCoreRuntimeFailure(repository, error, { maxAttempts = 3 } = {}) {
  const jobs = await repository.list();
  const candidate = jobs
    .filter(supervised)
    .filter(job => ACTIONABLE_FAILURE_STATES.has(String(job?.status || '').toUpperCase()))
    .sort(failureCandidateSort)[0] || null;
  if (!candidate) return { job_id: null, attempts: 0, quarantined: false, code: error?.code || error?.message || 'AUTONOMY_RUNTIME_FAILED' };

  const code = String(error?.code || error?.message || 'AUTONOMY_RUNTIME_FAILED').slice(0, 180);
  const result = candidate.result_json && typeof candidate.result_json === 'object' ? { ...candidate.result_json } : {};
  const previous = result.runtime_retry && typeof result.runtime_retry === 'object' ? result.runtime_retry : {};
  const attempts = Number(previous.attempts || 0) + 1;
  result.runtime_retry = {
    attempts,
    last_error: code,
    last_attempt_at: new Date().toISOString(),
    policy: 'retry-then-quarantine',
    explanation: attempts >= maxAttempts
      ? 'Ce travail bloquait plusieurs passages MEL. Il est isolé pour que la file continue ; le diagnostic reste visible.'
      : 'Erreur transitoire pendant ce passage. MEL retentera automatiquement sans bloquer les autres files passives.',
  };

  if (attempts >= maxAttempts) {
    result.runtime_retry.quarantined = true;
    const updated = await repository.update(candidate.id, {
      status: 'FAILED',
      result_json: result,
      error: `AUTONOMY_RUNTIME_RETRY_EXHAUSTED:${code}`,
    });
    return { job_id: updated.id, attempts, quarantined: true, code };
  }

  const updated = await repository.update(candidate.id, {
    result_json: result,
    error: `AUTONOMY_RUNTIME_RETRY:${code}`,
  });
  return { job_id: updated.id, attempts, quarantined: false, code };
}

async function runCoreResilient(env, coreOptions, repository) {
  try {
    return await runCoreAutonomyRuntimeTick(env, coreOptions);
  } catch (error) {
    // Configuration/safety errors must never be converted into a retryable job.
    // Retrying those would hide a bad branch configuration and weaken the
    // candidate-only deployment boundary.
    if (mustFailClosed(error)) throw error;

    const failure = await recordCoreRuntimeFailure(repository, error).catch(() => ({
      job_id: null,
      attempts: 0,
      quarantined: false,
      code: error?.code || error?.message || 'AUTONOMY_RUNTIME_FAILED',
    }));

    // Once a repeatedly blocking item is quarantined, immediately give the
    // same heartbeat one bounded chance to advance the next executable item.
    if (failure.quarantined) {
      try {
        const next = await runCoreAutonomyRuntimeTick(env, coreOptions);
        return { ...next, recovered_after_quarantine: failure };
      } catch (secondError) {
        if (mustFailClosed(secondError)) throw secondError;
        return {
          ok: false,
          status: 'CORE_RETRY_FAILED',
          runtime_error: secondError?.code || secondError?.message || 'AUTONOMY_RUNTIME_FAILED',
          quarantined: failure,
          job: null,
          next: null,
        };
      }
    }

    return {
      ok: false,
      status: 'CORE_RETRY_PENDING',
      runtime_error: failure.code,
      retry: failure,
      job: failure.job_id ? { id: failure.job_id, status: 'QUEUED' } : null,
      next: null,
    };
  }
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

// Every heartbeat performs queue hygiene, passive-state recovery, Teacher and
// completion reconciliation, and one bounded executable step. Obsolete owner
// rows are archived as CANCELLED rather than deleted. A single repeatedly
// failing job is quarantined after three passages so it cannot freeze MEL.
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
  const first = await runCoreResilient(env, coreOptions, repository);

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

  const second = await runCoreResilient(env, coreOptions, repository);
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

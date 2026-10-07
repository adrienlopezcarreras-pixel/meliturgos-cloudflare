import { runAutonomyRuntimeTick as runCoreAutonomyRuntimeTick } from './autonomy-runtime-core.js';
import { getAutonomyControl } from './autonomy-control.js';
import { AutonomySupervisor, selectActionableAutonomyJob } from './autonomy-supervisor.js';
import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import { applyOwnerMaxApproval } from '../teachers/owner-max-approval.js';
import { mirrorRuntimeTeacherRequestToGitHub } from '../teachers/github-request-mirror.js';
import { mirrorAllWaitingOwnerChatTeachers } from '../teachers/owner-chat-teacher-mirror.js';
import { recoverPassiveRuntimeStates } from './passive-state-recovery.js';
import { retireObsoleteQueueJobs } from './queue-hygiene.js';
import { tryAcquireAutonomyRuntimeLease, releaseAutonomyRuntimeLease } from './autonomy-runtime-lease.js';
import { createZeroCostBenchmarkEvaluator } from '../learning/operator-actions.js';
import { reconcileRuntimeCompletions } from '../teachers/github-completion-reconciler.js';
import { recordAutonomyProgressWatchdog, resetAutonomyProgressWatchdog } from './autonomy-progress-watchdog.js';

export * from './autonomy-runtime-core.js';

const CANONICAL_CANDIDATE_BRANCH = 'candidate/mel-clean-autonomy';
const ACTIONABLE_FAILURE_STATES = new Set(['QUEUED', 'CLAIMED', 'COUNCIL_COMPLETE', 'TEACHER_APPROVED']);
const ACTIVE_RUNTIME_STATES = new Set([
  'QUEUED',
  'CLAIMED',
  'COUNCIL_COMPLETE',
  'WAITING_TEACHER',
  'TEACHER_APPROVED',
  'READY_FOR_REVIEW',
]);
const FATAL_RUNTIME_CONFIGURATION_ERRORS = new Set([
  'AUTONOMY_BRANCH_NOT_CANDIDATE',
  'TEACHER_BRANCH_NOT_CANDIDATE',
  'AUTONOMY_CANDIDATE_BRANCH_DIVERGENCE',
]);

function deployedCandidateSha(env = {}) {
  const direct = String(env?.MEL_DEPLOYED_GIT_SHA || '').trim();
  if (/^[a-f0-9]{40}$/i.test(direct)) return direct.toLowerCase();
  try {
    const built = typeof MEL_DEPLOYED_GIT_SHA !== 'undefined' ? String(MEL_DEPLOYED_GIT_SHA || '').trim() : '';
    return /^[a-f0-9]{40}$/i.test(built) ? built.toLowerCase() : '';
  } catch {
    return '';
  }
}

function launchApprovalValid(env, control, options = {}) {
  if (!env?.DB || options?.skipLaunchGate === true) return { ok: true, enforced: false };
  const sha = deployedCandidateSha(env);
  if (!sha) return { ok: false, enforced: true, code: 'DEPLOYED_SHA_UNAVAILABLE', deployed_sha: null };
  if (String(control?.launch_approved_sha || '').toLowerCase() !== sha) {
    return {
      ok: false,
      enforced: true,
      code: 'LAUNCH_GATE_REQUIRED',
      deployed_sha: sha,
      approved_sha: control?.launch_approved_sha || null,
    };
  }
  return { ok: true, enforced: true, deployed_sha: sha, approved_sha: sha };
}

export async function reconcileVerifiedCompletionsBehindLaunchGate(env = {}, options = {}) {
  const repository = options.repository || (env?.DB ? new D1DevJobRepository(env.DB) : null);
  if (!repository) {
    return { ok: true, skipped: true, reason: 'COMPLETION_REPOSITORY_UNAVAILABLE', completed: [], rejected: [] };
  }
  const benchmarkRuntime = resolveRuntimeBenchmarkEvaluator(env, options);
  const reconcile = typeof options.completionReconciler === 'function'
    ? options.completionReconciler
    : reconcileRuntimeCompletions;
  try {
    return await reconcile({
      repository,
      env,
      fetchImpl: options.fetchImpl || fetch,
      benchmarkEvaluator: benchmarkRuntime.evaluator,
      benchmarkModelId: benchmarkRuntime.model_id,
    });
  } catch (error) {
    return {
      ok: false,
      error: String(error?.code || error?.message || 'COMPLETION_RECONCILE_FAILED').slice(0, 180),
      completed: [],
      rejected: [],
    };
  }
}

export function resolveRuntimeBenchmarkEvaluator(env = {}, options = {}) {
  if (typeof options.benchmarkEvaluator === 'function') {
    return {
      evaluator: options.benchmarkEvaluator,
      model_id: String(options.benchmarkModelId || ''),
      error: null,
    };
  }

  try {
    const prepared = createZeroCostBenchmarkEvaluator(env, options.benchmarkDeps?.evaluatorDeps || {});
    return {
      evaluator: prepared?.evaluator || null,
      model_id: String(prepared?.model_id || ''),
      error: null,
    };
  } catch (error) {
    return {
      evaluator: null,
      model_id: '',
      error: String(error?.code || error?.message || 'BENCHMARK_EVALUATOR_UNAVAILABLE').slice(0, 180),
    };
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

function validateCandidateBranches(env = {}) {
  const canonicalBranch = String(env?.MEL_GITHUB_BRANCH || CANONICAL_CANDIDATE_BRANCH).trim();
  const teacherBranch = String(env?.MEL_TEACHER_BRANCH || canonicalBranch).trim();
  if (!canonicalBranch.startsWith('candidate/')) {
    throw Object.assign(new Error('AUTONOMY_BRANCH_NOT_CANDIDATE'), { code: 'AUTONOMY_BRANCH_NOT_CANDIDATE' });
  }
  if (!teacherBranch.startsWith('candidate/')) {
    throw Object.assign(new Error('TEACHER_BRANCH_NOT_CANDIDATE'), { code: 'TEACHER_BRANCH_NOT_CANDIDATE' });
  }
  if (canonicalBranch !== teacherBranch) {
    throw Object.assign(new Error('AUTONOMY_CANDIDATE_BRANCH_DIVERGENCE'), {
      code: 'AUTONOMY_CANDIDATE_BRANCH_DIVERGENCE',
      canonical_branch: canonicalBranch,
      teacher_branch: teacherBranch,
    });
  }
  return { canonicalBranch, teacherBranch };
}

async function hasActiveRuntimeWork(repository) {
  const jobs = await repository.list();
  return jobs.some((job) => supervised(job) && ACTIVE_RUNTIME_STATES.has(String(job?.status || '').toUpperCase()));
}

async function ensureNextRuntimeJob(repository, roadmap = null) {
  try {
    const supervisor = new AutonomySupervisor({ repository, ...(roadmap ? { roadmap } : {}) });
    const ensured = await supervisor.ensureNextJob();
    return {
      created: ensured?.created === true,
      job_id: ensured?.job?.id || null,
      status: ensured?.job?.status || null,
      roadmap_id: ensured?.job?.optional_context?.roadmap_id || null,
      next_roadmap_id: ensured?.next?.id || null,
      complete: ensured?.complete === true,
    };
  } catch (error) {
    return {
      created: false,
      job_id: null,
      status: null,
      roadmap_id: null,
      next_roadmap_id: null,
      complete: false,
      error: error?.code || error?.message || 'AUTONOMY_PRE_ENSURE_FAILED',
    };
  }
}

function preservePreEnsureCreation(result, preEnsure) {
  if (!preEnsure?.created || !result || typeof result !== 'object') return result;
  const ensured = result.ensured && typeof result.ensured === 'object' ? result.ensured : {};
  return {
    ...result,
    ensured: {
      ...ensured,
      created: true,
    },
  };
}

async function recordCoreRuntimeFailure(repository, error, { maxAttempts = 3 } = {}) {
  const jobs = await repository.list();
  const schedulerSelected = selectActionableAutonomyJob(
    jobs.filter(job => ACTIONABLE_FAILURE_STATES.has(String(job?.status || '').toUpperCase()))
  );
  const candidate = schedulerSelected || jobs
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
    result.autonomy_blocked = true;
    result.autonomy_block_reason = 'RUNTIME_RETRY_EXHAUSTED';
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

export async function mirrorAllWaitingInternalTeachers({ env = {}, repository, fetchImpl = fetch, limit = 50, excludeRequestIds = [] } = {}) {
  if (!repository || typeof repository.list !== 'function') {
    throw Object.assign(new Error('INTERNAL_TEACHER_REPOSITORY_REQUIRED'), { code: 'INTERNAL_TEACHER_REPOSITORY_REQUIRED' });
  }
  const excluded = new Set((Array.isArray(excludeRequestIds) ? excludeRequestIds : []).map(value => String(value || '')).filter(Boolean));
  const jobs = await repository.list();
  const waiting = jobs
    .filter(internalWaitingTeacher)
    .filter(job => !excluded.has(String(job?.result_json?.teacher_bridge?.request?.request_id || '')))
    .slice(0, Math.max(1, Math.min(100, Number(limit) || 50)));
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

// Every heartbeat persists/selects the next executable roadmap job before slow
// external work only when MEL is genuinely idle. Existing active work must be
// reconciled first so Teacher replies/completions keep their exact job ordering.
async function runAutonomyRuntimeTickUnlocked(env, options = {}, knownControl = null) {
  const control = knownControl || await getAutonomyControl(env?.DB, { memoryState: options.autonomyControlState || null });
  if (control.paused) {
    return {
      status: 'PAUSED',
      paused: true,
      advanced: false,
      candidate_branch: env?.MEL_GITHUB_BRANCH || CANONICAL_CANDIDATE_BRANCH,
      control,
    };
  }

  // Validate the candidate-only safety boundary before any pre-creation side effect.
  validateCandidateBranches(env);

  const repository = options.repository || new D1DevJobRepository(env.DB);
  let preEnsure = {
    created: false,
    job_id: null,
    status: null,
    roadmap_id: null,
    next_roadmap_id: null,
    complete: false,
  };
  try {
    if (!(await hasActiveRuntimeWork(repository))) {
      preEnsure = await ensureNextRuntimeJob(repository, options.roadmap || null);
    }
  } catch (error) {
    preEnsure = {
      ...preEnsure,
      error: error?.code || error?.message || 'AUTONOMY_PRE_ENSURE_CHECK_FAILED',
    };
  }

  const queueHygiene = null;
  const passiveRecovery = null;

  const benchmarkRuntime = resolveRuntimeBenchmarkEvaluator(env, options);
  const coreOptions = {
    ...options,
    repository,
    benchmarkEvaluator: benchmarkRuntime.evaluator,
    benchmarkModelId: benchmarkRuntime.model_id,
    maxAutonomy: control.max_autonomy === true,
  };
  const first = preservePreEnsureCreation(await runCoreResilient(env, coreOptions, repository), preEnsure);

  let internalTeacherMirror = null;
  try {
    const mirroredInCore = first?.teacher_mirror
      && ['MIRRORED', 'ALREADY_PRESENT'].includes(String(first.teacher_mirror.status || '').toUpperCase())
      && first.teacher_mirror.request_id
      ? [first.teacher_mirror.request_id]
      : [];
    internalTeacherMirror = await mirrorAllWaitingInternalTeachers({
      env,
      repository,
      fetchImpl: options.fetchImpl || fetch,
      excludeRequestIds: mirroredInCore,
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
      pre_ensure: preEnsure,
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
      pre_ensure: preEnsure,
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
      pre_ensure: preEnsure,
      queue_hygiene: queueHygiene,
      passive_recovery: passiveRecovery,
      internal_teacher_mirror: internalTeacherMirror,
      owner_chat_teacher_mirror: ownerChatTeacherMirror,
      owner_max_applied: false,
      owner_max_sweep: ownerMaxSweep,
    };
  }

  const second = preservePreEnsureCreation(await runCoreResilient(env, coreOptions, repository), preEnsure);
  return {
    ...second,
    control,
    pre_ensure: preEnsure,
    queue_hygiene: queueHygiene,
    passive_recovery: passiveRecovery,
    internal_teacher_mirror: internalTeacherMirror,
    owner_chat_teacher_mirror: ownerChatTeacherMirror,
    owner_max_applied: true,
    owner_max_sweep: ownerMaxSweep,
    owner_max_bypassed_stage: 'WAITING_TEACHER',
    production_release_allowed: control.max_autonomy === true,
  };
}


export async function runAutonomyMaintenance(env, options = {}) {
  const repository = options.repository || new D1DevJobRepository(env?.DB);
  if (!env?.DB && !options.repository) {
    throw Object.assign(new Error('AUTONOMY_MAINTENANCE_DB_REQUIRED'), { code: 'AUTONOMY_MAINTENANCE_DB_REQUIRED', status: 503 });
  }

  const owner = String(options.runtimeLeaseOwner || `maintenance-${crypto.randomUUID()}`);
  const runtimeLeaseStore = options.runtimeLeaseStore ?? (!env?.DB ? new Map() : null);
  const lease = await tryAcquireAutonomyRuntimeLease({
    db: env?.DB || null,
    owner,
    leaseMs: options.runtimeLeaseMs ?? env?.MEL_AUTONOMY_LEASE_MS,
    memoryStore: runtimeLeaseStore,
  });

  if (!lease.acquired) {
    return {
      ok: true,
      status: 'SKIPPED_LEASE_BUSY',
      skipped: true,
      reason: 'AUTONOMY_RUNTIME_LEASE_BUSY',
      lease: { expires_at: lease.expires_at || null },
    };
  }

  try {
    let queueHygiene;
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

    let passiveRecovery;
    try {
      passiveRecovery = await recoverPassiveRuntimeStates(repository, {
        canonicalSha: deployedCandidateSha(env),
        limit: 200,
      });
    } catch (error) {
      passiveRecovery = {
        attempted: 0,
        recovered: [],
        failed: [{ job_id: null, code: error?.code || error?.message || 'PASSIVE_RECOVERY_FAILED' }],
        canonical_sha: deployedCandidateSha(env) || null,
      };
    }

    return {
      ok: true,
      status: 'MAINTENANCE_COMPLETE',
      queue_hygiene: queueHygiene,
      passive_recovery: passiveRecovery,
    };
  } finally {
    await releaseAutonomyRuntimeLease({
      db: env?.DB || null,
      owner,
      memoryStore: runtimeLeaseStore,
    }).catch(() => false);
  }
}

async function autonomyProgressSnapshot(repository, roadmap = null) {
  try {
    const supervisor = new AutonomySupervisor({ repository, ...(roadmap ? { roadmap } : {}) });
    const state = await supervisor.state();
    const active = Array.isArray(state?.active) ? state.active : [];
    const actionable = selectActionableAutonomyJob(active);
    return {
      work_remaining: active.length > 0 || Boolean(state?.next),
      active_jobs: active.length,
      next_roadmap_id: state?.next?.id || null,
      job_id: actionable?.id || active[0]?.id || null,
      job_status: String(actionable?.status || active[0]?.status || '').toUpperCase() || null,
    };
  } catch {
    return {
      work_remaining: null,
      active_jobs: null,
      next_roadmap_id: null,
      job_id: null,
      job_status: null,
    };
  }
}

function augmentTickProgress(tick = {}) {
  const progress = tick?.progress && typeof tick.progress === 'object' ? { ...tick.progress } : {};
  const events = new Set(Array.isArray(progress.events) ? progress.events : []);
  if (Array.isArray(tick?.owner_max_sweep?.applied) && tick.owner_max_sweep.applied.length > 0) events.add('OWNER_MAX_APPROVAL_APPLIED');
  if (Array.isArray(tick?.internal_teacher_mirror?.mirrored) && tick.internal_teacher_mirror.mirrored.length > 0) events.add('TEACHER_REQUEST_MIRRORED');
  if (Array.isArray(tick?.owner_chat_teacher_mirror?.mirrored) && tick.owner_chat_teacher_mirror.mirrored.length > 0) events.add('OWNER_CHAT_TEACHER_MIRRORED');
  if (tick?.pre_ensure?.created === true) events.add('JOB_CREATED');
  const advanced = tick?.advanced === true || events.size > 0;
  return {
    ...tick,
    advanced,
    progress: {
      ...progress,
      advanced,
      events: [...events],
      block_reason: progress.block_reason || tick?.owner_max_error || tick?.runtime_error || null,
    },
  };
}

export async function runAutonomyRuntimeTick(env, options = {}) {
  const control = await getAutonomyControl(env?.DB, { memoryState: options.autonomyControlState || null });
  const repository = options.repository || (env?.DB ? new D1DevJobRepository(env.DB) : null);

  if (control.paused) {
    const watchdog = await resetAutonomyProgressWatchdog(env?.DB || null, { status: 'PAUSED' }).catch(() => null);
    return {
      status: 'PAUSED',
      paused: true,
      advanced: false,
      progress: {
        advanced: false,
        events: [],
        work_remaining: null,
        waiting_external: false,
        block_reason: 'PAUSED',
      },
      watchdog,
      candidate_branch: env?.MEL_GITHUB_BRANCH || CANONICAL_CANDIDATE_BRANCH,
      control,
    };
  }

  const launchApproval = launchApprovalValid(env, control, options);
  if (!launchApproval.ok) {
    const passiveCompletions = await reconcileVerifiedCompletionsBehindLaunchGate(env, options);
    const snapshot = repository ? await autonomyProgressSnapshot(repository, options.roadmap || null) : {};
    const base = {
      ok: false,
      status: launchApproval.code,
      advanced: false,
      progress: {
        advanced: false,
        events: [],
        work_remaining: snapshot.work_remaining === true,
        active_jobs: snapshot.active_jobs ?? null,
        next_roadmap_id: snapshot.next_roadmap_id || null,
        job_id: snapshot.job_id || null,
        job_status: snapshot.job_status || null,
        waiting_external: false,
        block_reason: launchApproval.code,
      },
      candidate_branch: env?.MEL_GITHUB_BRANCH || CANONICAL_CANDIDATE_BRANCH,
      control,
      launch_gate: launchApproval,
      passive_completions: passiveCompletions,
    };
    base.watchdog = await recordAutonomyProgressWatchdog(env?.DB || null, base, {
      maxAutonomy: control.max_autonomy === true,
    }).catch(() => null);
    return base;
  }

  validateCandidateBranches(env);

  const owner = String(options.runtimeLeaseOwner || crypto.randomUUID());
  const runtimeLeaseStore = options.runtimeLeaseStore ?? (!env?.DB ? new Map() : null);
  const lease = await tryAcquireAutonomyRuntimeLease({
    db: env?.DB || null,
    owner,
    leaseMs: options.runtimeLeaseMs ?? env?.MEL_AUTONOMY_LEASE_MS,
    memoryStore: runtimeLeaseStore,
  });

  if (!lease.acquired) {
    const snapshot = repository ? await autonomyProgressSnapshot(repository, options.roadmap || null) : {};
    const base = {
      ok: true,
      status: 'SKIPPED_LEASE_BUSY',
      skipped: true,
      advanced: false,
      reason: 'AUTONOMY_RUNTIME_LEASE_BUSY',
      progress: {
        advanced: false,
        events: [],
        work_remaining: snapshot.work_remaining === true,
        active_jobs: snapshot.active_jobs ?? null,
        next_roadmap_id: snapshot.next_roadmap_id || null,
        job_id: snapshot.job_id || null,
        job_status: snapshot.job_status || null,
        waiting_external: false,
        block_reason: 'AUTONOMY_RUNTIME_LEASE_BUSY',
      },
      candidate_branch: env?.MEL_GITHUB_BRANCH || CANONICAL_CANDIDATE_BRANCH,
      control,
      lease: { expires_at: lease.expires_at || null },
    };
    const watchdog = await recordAutonomyProgressWatchdog(env?.DB || null, base, {
      maxAutonomy: control.max_autonomy === true,
    }).catch(() => null);
    return watchdog?.tripped === true
      ? { ...base, ok: false, status: 'MAX_PROGRESS_STALLED', watchdog }
      : { ...base, watchdog };
  }

  try {
    const raw = await runAutonomyRuntimeTickUnlocked(env, { ...options, repository: repository || options.repository }, control);
    const tick = augmentTickProgress(raw);
    const watchdog = await recordAutonomyProgressWatchdog(env?.DB || null, tick, {
      maxAutonomy: control.max_autonomy === true,
    }).catch(() => null);
    if (watchdog?.tripped === true) {
      return {
        ...tick,
        ok: false,
        status: 'MAX_PROGRESS_STALLED',
        watchdog,
        progress: {
          ...(tick.progress || {}),
          block_reason: watchdog.last_block_reason || tick?.progress?.block_reason || 'MAX_PROGRESS_STALLED',
        },
      };
    }
    return { ...tick, watchdog };
  } finally {
    await releaseAutonomyRuntimeLease({
      db: env?.DB || null,
      owner,
      memoryStore: runtimeLeaseStore,
    }).catch(() => false);
  }
}

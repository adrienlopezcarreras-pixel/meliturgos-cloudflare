import { jobActivityTimestamp } from './autonomy-job-epoch.js';
import { runAutonomyRuntimeTick as runCoreAutonomyRuntimeTick, autonomyTickAdvanced, currentAutonomyRepository } from './autonomy-runtime-core.js';
import { createRuntimeEvolutionLoader } from '../roadmap/evolution-storage.js';
import { getAutonomyControl, setOwnerMaxAutonomy } from './autonomy-control.js';
import { AutonomySupervisor, selectActionableAutonomyJob, selectActionableAutonomyJobs, setRuntimeRoadmapRegressions } from './autonomy-supervisor.js';
import { activeRoadmapRegressions } from '../roadmap/roadmap-regressions.js';
import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import { applyOwnerMaxApproval } from '../teachers/owner-max-approval.js';
import { mirrorRuntimeTeacherRequestToGitHub } from '../teachers/github-request-mirror.js';
import { mirrorAllWaitingOwnerChatTeachers } from '../teachers/owner-chat-teacher-mirror.js';
import { recoverPassiveRuntimeStates } from './passive-state-recovery.js';
import { retireObsoleteQueueJobs } from './queue-hygiene.js';
import { tryAcquireAutonomyRuntimeLease, releaseAutonomyRuntimeLease, keepAutonomyRuntimeLeaseAlive } from './autonomy-runtime-lease.js';
import { createZeroCostBenchmarkEvaluator } from '../learning/operator-actions.js';
import { reconcileRuntimeCompletions } from '../teachers/github-completion-reconciler.js';
import { recordAutonomyProgressWatchdog, resetAutonomyProgressWatchdog } from './autonomy-progress-watchdog.js';
import { readActivityListEpoch } from './autonomy-activity.js';
import { backgroundNeuronBudgetExhausted } from '../augmentio/neuron-budget.js';
import { bindLocalPcWorkersAi, localPcModelReady } from '../models/local-pc-model.js';
import { readSurvivalState, shouldResumeForSurvival } from '../legacy/survival-mode.js';

export * from './autonomy-runtime-core.js';

const CANONICAL_CANDIDATE_BRANCH = 'candidate/mel-clean-autonomy';
// One 8 GB GPU keeps a single coder loaded. Two developments run at the same
// time against that model. Four is the most one tick may start.
export const PC_DEVELOPMENTS_PER_TICK = 4;
export const PC_PARALLEL_DEVELOPMENTS = 2;

export async function advanceMoreOnPc({ env, ready = localPcModelReady, run, seed, alreadyRan = 1, limit = PC_DEVELOPMENTS_PER_TICK, selectJobs = null, width = PC_PARALLEL_DEVELOPMENTS } = {}) {
  const local = await ready(env).catch(() => null);
  if (!local?.ok || typeof run !== 'function') return { result: seed, ran: alreadyRan, job_ids: [] };
  const room = Math.max(0, limit - alreadyRan);
  const ids = room > 0 && typeof selectJobs === 'function'
    ? (await selectJobs(room).catch(() => [])).filter(Boolean).slice(0, room)
    : [];
  if (ids.length > 1) {
    const lanes = Math.max(1, Math.min(width, ids.length));
    const results = [];
    for (let index = 0; index < ids.length; index += lanes) {
      const slice = ids.slice(index, index + lanes);
      results.push(...await Promise.all(slice.map(onlyJobId => run({ onlyJobId }))));
    }
    return {
      result: results[results.length - 1] || seed,
      ran: alreadyRan + ids.length,
      job_ids: results.map(row => row?.progress?.job_id || row?.job?.id || null),
      device_id: local.device_id || null,
      parallel: true,
    };
  }
  let result = seed;
  let ran = alreadyRan;
  const job_ids = [];
  const skip = new Set(ids);
  while (ran < limit) {
    if (result?.progress?.work_remaining !== true || result?.progress?.waiting_external === true) break;
    const next = await run({ skipJobIds: [...skip] });
    ran += 1;
    const jobId = next?.progress?.job_id || next?.job?.id || null;
    job_ids.push(jobId);
    if (jobId) skip.add(jobId);
    result = next;
    if (next?.progress?.advanced !== true && next?.advanced !== true && !jobId) break;
  }
  return { result, ran, job_ids, device_id: local.device_id || null };
}

async function selectablePcJobs(repository, epochMs, roadmap, count, singleFlight = false) {
  const supervisor = new AutonomySupervisor({ repository, epochMs, ...(roadmap ? { roadmap } : {}) });
  const state = await supervisor.state();
  const jobs = selectActionableAutonomyJobs(state.active, { epochMs, limit: count, ...(roadmap ? { roadmap } : {}) });
  // MAX never runs separate development objectives in parallel on the PC.
  // The normal mode retains its existing parallel capacity.
  return (singleFlight ? jobs.slice(0, 1) : jobs).map(job => job.id);
}
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
  const epochMs = options.epochMs ?? await readActivityListEpoch(env?.DB, { strict: true });
  const reconcile = typeof options.completionReconciler === 'function'
    ? options.completionReconciler
    : reconcileRuntimeCompletions;
  try {
    return await reconcile({
      repository: currentAutonomyRepository(repository, epochMs),
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

export function validateCandidateBranches(env = {}) {
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

async function hasActiveRuntimeWork(repository, epochMs = 0) {
  const jobs = await repository.list();
  const epoch = Number(epochMs) || 0;
  return jobs.some((job) => supervised(job)
    && (!epoch || jobActivityTimestamp(job) >= epoch)
    && ACTIVE_RUNTIME_STATES.has(String(job?.status || '').toUpperCase()));
}

async function ensureNextRuntimeJob(repository, roadmap = null, epochMs = 0, singleFlight = false) {
  try {
    const supervisor = new AutonomySupervisor({ repository, epochMs, singleFlight, ...(roadmap ? { roadmap } : {}) });
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

async function recordCoreRuntimeFailure(repository, error, { maxAttempts = 3, epochMs = 0, roadmap, evolutionLoader = null, onlyJobId = null } = {}) {
  const supervisor = new AutonomySupervisor({ repository: currentAutonomyRepository(repository, epochMs), epochMs, ...(roadmap ? { roadmap } : {}), evolutionLoader });
  const jobs = (await supervisor.state()).active.filter(job => !onlyJobId || job.id === onlyJobId);
  const schedulerSelected = selectActionableAutonomyJob(
    jobs.filter(job => ACTIONABLE_FAILURE_STATES.has(String(job?.status || '').toUpperCase())),
    { epochMs, ...(roadmap ? { roadmap } : {}) },
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
  result.proof = {
    status: 'ÉCHEC',
    tool: String(candidate?.optional_context?.roadmap_id || ''),
    code,
    request_id: String(candidate.id || ''),
  };
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
    }, { expected: candidate });
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

    // A CAS conflict means another writer (Bridge result, Council, passive
    // recovery) updated the job first: the fence worked and the next tick
    // re-reads. Counting it as a job failure quarantined healthy jobs
    // (AUTONOMY_RUNTIME_RETRY_EXHAUSTED:JOB_UPDATE_CONFLICT on MANIFEST-02,
    // FOUNDER-03, FOUNDER-08). It never increments runtime_retry.
    if (String(error?.code || '') === 'JOB_UPDATE_CONFLICT') {
      return {
        ok: false,
        status: 'CORE_RETRY_PENDING',
        runtime_error: 'JOB_UPDATE_CONFLICT',
        retry: { job_id: null, attempts: 0, quarantined: false, code: 'JOB_UPDATE_CONFLICT' },
        job: null,
        next: null,
      };
    }

    const failure = await recordCoreRuntimeFailure(repository, error, { epochMs: coreOptions.epochMs, roadmap: coreOptions.roadmap, onlyJobId: coreOptions.onlyJobId, evolutionLoader: coreOptions.roadmap ? null : createRuntimeEvolutionLoader(env) }).catch(() => ({
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

export async function approveAllWaitingTeachersUnderOwnerMax(repository, { source = 'owner-max-runtime', limit = 50, onlyJobId = null } = {}) {
  if (!repository || typeof repository.list !== 'function') {
    throw Object.assign(new Error('OWNER_MAX_REPOSITORY_REQUIRED'), { code: 'OWNER_MAX_REPOSITORY_REQUIRED' });
  }
  const jobs = await repository.list();
  const waiting = jobs.filter(job => !onlyJobId || job.id === onlyJobId).filter(waitingTeacher).slice(0, Math.max(1, Math.min(100, Number(limit) || 50)));
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
  const epochMs = options.epochMs ?? await readActivityListEpoch(env?.DB, { strict: true });
  const currentRepository = currentAutonomyRepository(repository, epochMs);
  let preEnsure = {
    created: false,
    job_id: null,
    status: null,
    roadmap_id: null,
    next_roadmap_id: null,
    complete: false,
  };
  try {
    if (!options.onlyJobId && !(await hasActiveRuntimeWork(repository, epochMs))) {
      preEnsure = await ensureNextRuntimeJob(repository, options.roadmap || null, epochMs, control.max_autonomy === true);
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
    epochMs,
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
      repository: currentRepository,
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
      repository: currentRepository,
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
    ownerMaxSweep = await approveAllWaitingTeachersUnderOwnerMax(currentRepository, { source: 'owner-max-runtime', onlyJobId: options.onlyJobId || null });
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
    const more = await advanceMoreOnPc({
      env,
      seed: first,
      limit: options.onlyJobId ? 1 : PC_DEVELOPMENTS_PER_TICK,
      run: async ({ onlyJobId } = {}) => {
        bindLocalPcWorkersAi(env, options.runLocalPcModel);
        return preservePreEnsureCreation(await runCoreResilient(env, { ...coreOptions, onlyJobId: onlyJobId || null }, repository), preEnsure);
      },
      selectJobs: (count) => selectablePcJobs(currentRepository, epochMs, options.roadmap, count, control.max_autonomy === true),
    });
    return {
      ...more.result,
      control,
      pre_ensure: preEnsure,
      queue_hygiene: queueHygiene,
      passive_recovery: passiveRecovery,
      internal_teacher_mirror: internalTeacherMirror,
      owner_chat_teacher_mirror: ownerChatTeacherMirror,
      owner_max_applied: false,
      owner_max_sweep: ownerMaxSweep,
      jobs_this_tick: more.ran,
    };
  }

  const second = preservePreEnsureCreation(await runCoreResilient(env, coreOptions, repository), preEnsure);
  const more = await advanceMoreOnPc({
    env,
    seed: second,
    alreadyRan: 2,
    limit: options.onlyJobId ? 2 : PC_DEVELOPMENTS_PER_TICK,
    run: async ({ onlyJobId } = {}) => {
      bindLocalPcWorkersAi(env, options.runLocalPcModel);
      return preservePreEnsureCreation(await runCoreResilient(env, { ...coreOptions, onlyJobId: onlyJobId || null }, repository), preEnsure);
    },
    selectJobs: (count) => selectablePcJobs(currentRepository, epochMs, options.roadmap, count, control.max_autonomy === true),
  });
  return {
    ...more.result,
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
    jobs_this_tick: more.ran,
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

async function autonomyProgressSnapshot(repository, roadmap = null, epochMs = 0) {
  try {
    const supervisor = new AutonomySupervisor({ repository, epochMs, ...(roadmap ? { roadmap } : {}) });
    const state = await supervisor.state();
    const active = Array.isArray(state?.active) ? state.active : [];
    const actionable = selectActionableAutonomyJob(active, { epochMs, ...(roadmap ? { roadmap } : {}) });
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
  const advanced = autonomyTickAdvanced([...events]);
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
  setRuntimeRoadmapRegressions(await activeRoadmapRegressions(env?.DB).catch(() => []));
  let control = await getAutonomyControl(env?.DB, { memoryState: options.autonomyControlState || null });
  const repository = options.repository || (env?.DB ? new D1DevJobRepository(env.DB) : null);
  const survival = await readSurvivalState(env?.DB).catch(() => ({ active: false }));
  if (shouldResumeForSurvival(control, survival) && env?.DB) {
    control = await setOwnerMaxAutonomy(env.DB, {
      enabled: true,
      paused: false,
      source: 'survival-mode',
      reason: 'owner-silent-one-year',
      memoryState: options.autonomyControlState || null,
    });
  }

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

  // The owner's PC codes first whenever local compute is actually allowed.
  // Neurons are kept for the chat and for a PC that failed. If the daily share
  // is already spent and the PC cannot code, MAX waits instead of failing.
  const local = typeof options.localPcReady === 'function'
    ? await options.localPcReady(env)
    : await localPcModelReady(env).catch(() => ({ ok: false, code: 'LOCAL_CHECK_FAILED' }));
  if (options.ignoreNeuronBudget !== true && await backgroundNeuronBudgetExhausted(env) && !local?.ok) {
    return {
      status: 'AI_BUDGET_EXHAUSTED',
      paused: false,
      advanced: false,
      progress: { advanced: false, events: [], work_remaining: null, waiting_external: true, block_reason: 'AI_DAILY_NEURON_BUDGET_EXHAUSTED' },
      local_pc: local?.code || 'LOCAL_UNAVAILABLE',
      candidate_branch: env?.MEL_GITHUB_BRANCH || CANONICAL_CANDIDATE_BRANCH,
      control,
    };
  }
  if (local?.ok) bindLocalPcWorkersAi(env, options.runLocalPcModel);

  const epochMs = await readActivityListEpoch(env?.DB, { strict: true });
  const launchApproval = launchApprovalValid(env, control, options);
  if (!launchApproval.ok) {
    let passiveCompletions;
    if (typeof options.waitUntil === 'function') {
      // The stale launch gate must fail closed immediately. Reconciling old,
      // already-verified completions can involve remote CI calls, so don't keep
      // the chat request open while doing that background-only maintenance.
      const reconciliation = reconcileVerifiedCompletionsBehindLaunchGate(env, { ...options, epochMs })
        .catch((error) => ({
          ok: false,
          queued: false,
          reason: String(error?.code || error?.message || 'PASSIVE_COMPLETION_RECONCILIATION_FAILED').slice(0, 180),
          completed: [],
          rejected: [],
        }));
      try {
        options.waitUntil(reconciliation);
        passiveCompletions = {
          ok: true,
          queued: true,
          reason: 'LAUNCH_GATE_BLOCKED_BACKGROUND_RECONCILIATION',
          completed: [],
          rejected: [],
        };
      } catch {
        passiveCompletions = {
          ok: false,
          queued: false,
          reason: 'BACKGROUND_RECONCILIATION_SCHEDULING_FAILED',
          completed: [],
          rejected: [],
        };
      }
    } else {
      passiveCompletions = await reconcileVerifiedCompletionsBehindLaunchGate(env, { ...options, epochMs });
    }
    const snapshot = repository ? await autonomyProgressSnapshot(repository, options.roadmap || null, epochMs) : {};
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
  const leaseArgs = {
    db: env?.DB || null,
    owner,
    leaseMs: options.runtimeLeaseMs ?? env?.MEL_AUTONOMY_LEASE_MS,
    memoryStore: runtimeLeaseStore,
  };
  const waitMs = Math.max(0, Math.min(95_000, Number(options.ownerLeaseWaitMs) || 0));
  const sleep = typeof options.sleep === 'function'
    ? options.sleep
    : (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const deadline = Date.now() + waitMs;
  let lease = await tryAcquireAutonomyRuntimeLease(leaseArgs);
  while (!lease.acquired && Date.now() < deadline) {
    const remaining = Math.max(0, Number(lease.expires_at || 0) - Date.now());
    const step = Math.min(1000, Math.max(50, remaining > 0 ? Math.min(remaining + 20, deadline - Date.now()) : 200));
    if (step <= 0) break;
    await sleep(step);
    lease = await tryAcquireAutonomyRuntimeLease(leaseArgs);
  }

  if (!lease.acquired) {
    const snapshot = repository ? await autonomyProgressSnapshot(repository, options.roadmap || null, epochMs) : {};
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

  const stopRenewal = keepAutonomyRuntimeLeaseAlive({ db: leaseArgs.db, owner: leaseArgs.owner, leaseMs: leaseArgs.leaseMs, memoryStore: leaseArgs.memoryStore });
  try {
    // A tick that never answers must not hold MAX (26/10: every tick hung for
    // minutes, the job stayed QUEUED): give up after the budget and free the lease.
    // 27/10: 50 s cut every Council plan review (438 timeouts at council-teacher).
    const tickBudgetMs = Number(options.tickBudgetMs ?? env?.MEL_AUTONOMY_TICK_BUDGET_MS ?? 240_000);
    let timer;
    const raw = await Promise.race([
      (globalThis.__melTickStage = 'pre-ensure', runAutonomyRuntimeTickUnlocked)(env, { ...options, epochMs, repository: repository || options.repository }, control),
      new Promise(resolve => { timer = setTimeout(() => resolve({ ok: false, status: 'TICK_TIMEOUT', advanced: false, progress: { advanced: false, block_reason: 'AUTONOMY_TICK_TIMEOUT' } }), tickBudgetMs); }),
    ]).finally(() => clearTimeout(timer));
    if (raw?.status === 'TICK_TIMEOUT') {
      const snapshot = repository ? await autonomyProgressSnapshot(repository, options.roadmap || null, epochMs) : {};
      raw.progress = { ...raw.progress, ...snapshot };
      await import('../diagnostics/error-ledger.js')
        .then(({ recordError }) => recordError(env?.DB, { source: 'max/autonomy-tick', code: 'AUTONOMY_TICK_TIMEOUT', detail: `tick > ${tickBudgetMs} ms, étape : ${globalThis.__melTickStage || 'avant-core'}` }))
        .catch(() => null);
    }
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
    stopRenewal();
    await releaseAutonomyRuntimeLease({
      db: env?.DB || null,
      owner,
      memoryStore: runtimeLeaseStore,
    }).catch(() => false);
  }
}

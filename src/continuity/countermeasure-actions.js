import { recoverPassiveRuntimeStates } from '../evolution/passive-state-recovery.js';

async function markJob(repository, status, code, expectedJobId = null) {
  if (typeof repository?.listActiveAutonomyJobs !== 'function' || typeof repository?.update !== 'function') {
    return { ok: false, code: 'REPOSITORY_REQUIRED' };
  }
  const jobs = await repository.listActiveAutonomyJobs();
  const active = Array.isArray(jobs) ? jobs.filter(row => row?.id) : [];
  // Never apply evidence for one tick to an unrelated active mission.
  if (!expectedJobId && active.length > 1) return { ok: false, code: 'AMBIGUOUS_ACTIVE_JOBS' };
  const job = expectedJobId ? active.find(row => row.id === expectedJobId) : active[0];
  if (!job) return { ok: false, idle: true, code: 'NO_ACTIVE_JOB', requested: code };
  const previous = job.result_json || {};
  const entry = { code, at: new Date().toISOString() };
  const history = Array.isArray(previous.countermeasure_history) ? previous.countermeasure_history : [];
  // Keep each decision for audit instead of overwriting the last one.
  const result = {
    ...previous,
    countermeasure: entry,
    countermeasure_history: [...history, entry].slice(-100),
  };
  const updated = await repository.update(job.id, {
    status: status || job.status,
    result_json: result,
    error: status === 'FAILED' ? code : (job.error ?? null),
  }, { expected: job });
  // The persistent repository can refuse an update when an owner cancelled
  // the job concurrently. Returning a valid job is not proof of a new write.
  if (String(updated?.status || '').toUpperCase() === 'CANCELLED'
      || updated?.result_json?.countermeasure?.code !== code
      || updated?.result_json?.countermeasure?.at !== entry.at) {
    return { ok: false, code: 'COUNTERMEASURE_AUDIT_NOT_PERSISTED' };
  }
  return { ok: true, code };
}

async function requeue(repository) {
  if (typeof repository?.list !== 'function' || typeof repository?.update !== 'function') {
    return { ok: false, code: 'REPOSITORY_REQUIRED' };
  }
  const recovered = await recoverPassiveRuntimeStates(repository, { activeOnly: true });
  const changed = Array.isArray(recovered?.recovered) ? recovered.recovered.length : 0;
  const failure = recovered?.failed?.[0]?.code;
  return { ok: !failure && changed > 0, code: failure || (changed ? 'MISSION_REQUEUED' : 'NO_RECOVERABLE_JOB'), recovered: changed };
}

export function bindCountermeasureActions({
  setMax,
  keepMax,
  repository = null,
  jobId = null,
  supervisor = null,
  rollbackWorker,
  previousVersionId = null,
  openPrivateCopy,
  rebuildFromPrivateKit,
  restoreBackupBytes,
} = {}) {
  const rollback = async () => {
    if (!previousVersionId) return { ok: false, code: 'PREVIOUS_VERSION_REQUIRED' };
    if (typeof rollbackWorker !== 'function') return { ok: false, code: 'ROLLBACK_NOT_CONFIGURED' };
    const result = await rollbackWorker(previousVersionId);
    if (result?.ok === true) {
      const audit = await markJob(repository, null, 'ROLLBACK_WORKER', jobId);
      if (audit.ok !== true) return { ok: false, code: audit.code || 'ROLLBACK_AUDIT_NOT_PERSISTED', rollback_performed: true };
      return { ok: true };
    }
    return { ok: false, code: result?.code || 'ROLLBACK_FAILED' };
  };
  const openKit = async () => {
    if (typeof openPrivateCopy !== 'function') return { ok: false, code: 'PRIVATE_KIT_REQUIRED' };
    const result = await openPrivateCopy();
    return result?.ok === true ? { ok: true } : { ok: false, code: result?.code || 'KIT_UNAVAILABLE' };
  };
  return {
    restoreMax: async () => {
      if (typeof setMax !== 'function') return { ok: false, code: 'CONTROL_REQUIRED' };
      const result = await setMax();
      return result?.ok === true && (result?.max_active === true || result?.active === true)
        ? { ok: true }
        : { ok: false, code: result?.code || 'MAX_REACTIVATION_NOT_PROVEN' };
    },
    keepMax: async () => {
      const fn = keepMax || setMax;
      if (typeof fn !== 'function') return { ok: false, code: 'CONTROL_REQUIRED' };
      const result = await fn();
      return result?.ok === true && (result?.max_active === true || result?.active === true)
        ? { ok: true }
        : { ok: false, code: result?.code || 'MAX_RUNNING_NOT_PROVEN' };
    },
    keepPrevious: () => markJob(repository, null, 'KEEP_PREVIOUS_SHA', jobId),
    refuseSecondRelease: () => markJob(repository, null, 'DO_NOT_START_SECOND_RELEASE', jobId),
    keepSource: () => markJob(repository, null, 'KEEP_SOURCE', jobId),
    refuseMerge: () => markJob(repository, null, 'DO_NOT_MERGE', jobId),
    requeue: () => requeue(repository),
    requeueReview: () => requeue(repository),
    ensureNextJob: async () => {
      if (typeof supervisor?.ensureNextJob !== 'function') return { ok: false, code: 'SUPERVISOR_REQUIRED' };
      const result = await supervisor.ensureNextJob();
      // Scheduler invocation is not the same as actual admission of one job.
      if (result?.created === true && result?.job?.id) return { ok: true, code: 'NEXT_JOB_CREATED' };
      return { ok: false, code: String(result?.external_progress?.status || (result?.complete === true ? 'ROADMAP_COMPLETE' : 'NO_NEW_JOB_CREATED')) };

    },
    reject: () => markJob(repository, 'FAILED', 'REJECT_CANDIDATE', jobId),
    rebuildHead: () => markJob(repository, 'QUEUED', 'REBUILD_ON_CURRENT_HEAD', jobId),
    rollback,
    rollbackToSource: () => markJob(repository, null, 'ROLLBACK_TO_SOURCE', jobId),
    rebuild: async () => {
      // Opening an encrypted kit is NOT a rebuild. Require a separate,
      // explicit full-reconstruction executor with an integrity result.
      if (typeof rebuildFromPrivateKit !== 'function') return { ok: false, code: 'FULL_REBUILD_EXECUTOR_REQUIRED' };
      const result = await rebuildFromPrivateKit();
      return result?.ok === true && result?.restored === true && result?.integrity_verified === true
        ? { ok: true, code: 'FULL_REBUILD_VERIFIED' }
        : { ok: false, code: result?.code || 'FULL_REBUILD_NOT_VERIFIED' };
    },
    restoreBackup: async () => {
      if (typeof restoreBackupBytes !== 'function') return { ok: false, code: 'BACKUP_REQUIRED' };
      const result = await restoreBackupBytes();
      return result?.ok === true && result?.restored === true && result?.integrity_verified === true
        ? { ok: true, code: 'BACKUP_RESTORE_VERIFIED' }
        : { ok: false, code: result?.code || 'BACKUP_RESTORE_NOT_VERIFIED' };
    },
    openKit,
    note: (code) => markJob(repository, null, String(code || 'CONTINGENCY_NOTED'), jobId),
  };
}

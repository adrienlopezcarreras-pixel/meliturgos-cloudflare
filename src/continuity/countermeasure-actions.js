import { recoverPassiveRuntimeStates } from '../evolution/passive-state-recovery.js';

async function markJob(repository, status, code) {
  if (typeof repository?.listActiveAutonomyJobs !== 'function' || typeof repository?.update !== 'function') {
    return { ok: false, code: 'REPOSITORY_REQUIRED' };
  }
  const jobs = await repository.listActiveAutonomyJobs();
  const job = Array.isArray(jobs) ? jobs.find(row => row?.id) : null;
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
  await repository.update(job.id, {
    status: status || job.status,
    result_json: result,
    error: status === 'FAILED' ? code : (job.error ?? null),
  }, { expected: job });
  return { ok: true, code };
}

async function requeue(repository) {
  if (typeof repository?.list !== 'function' || typeof repository?.update !== 'function') {
    return { ok: false, code: 'REPOSITORY_REQUIRED' };
  }
  const recovered = await recoverPassiveRuntimeStates(repository, { activeOnly: true });
  return { ok: recovered?.failed?.length ? false : true, code: recovered?.failed?.[0]?.code };
}

export function bindCountermeasureActions({
  setMax,
  keepMax,
  repository = null,
  supervisor = null,
  rollbackWorker,
  previousVersionId = null,
  openPrivateCopy,
  restoreBackupBytes,
} = {}) {
  const rollback = async () => {
    if (!previousVersionId) return { ok: false, code: 'PREVIOUS_VERSION_REQUIRED' };
    if (typeof rollbackWorker !== 'function') return { ok: false, code: 'ROLLBACK_NOT_CONFIGURED' };
    const result = await rollbackWorker(previousVersionId);
    if (result?.ok === true) {
      await markJob(repository, null, 'ROLLBACK_WORKER');
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
      await setMax();
      return { ok: true };
    },
    keepMax: async () => {
      const fn = keepMax || setMax;
      if (typeof fn !== 'function') return { ok: false, code: 'CONTROL_REQUIRED' };
      await fn();
      return { ok: true };
    },
    keepPrevious: () => markJob(repository, null, 'KEEP_PREVIOUS_SHA'),
    refuseSecondRelease: () => markJob(repository, null, 'DO_NOT_START_SECOND_RELEASE'),
    keepSource: () => markJob(repository, null, 'KEEP_SOURCE'),
    refuseMerge: () => markJob(repository, null, 'DO_NOT_MERGE'),
    requeue: () => requeue(repository),
    requeueReview: () => requeue(repository),
    ensureNextJob: async () => {
      if (typeof supervisor?.ensureNextJob !== 'function') return { ok: false, code: 'SUPERVISOR_REQUIRED' };
      await supervisor.ensureNextJob();
      return { ok: true };
    },
    reject: () => markJob(repository, 'FAILED', 'REJECT_CANDIDATE'),
    rebuildHead: () => markJob(repository, 'QUEUED', 'REBUILD_ON_CURRENT_HEAD'),
    rollback,
    rollbackToSource: () => markJob(repository, null, 'ROLLBACK_TO_SOURCE'),
    rebuild: openKit,
    restoreBackup: async () => {
      if (typeof restoreBackupBytes !== 'function') return { ok: false, code: 'BACKUP_REQUIRED' };
      const result = await restoreBackupBytes();
      return result?.ok === true ? { ok: true } : { ok: false, code: result?.code || 'BACKUP_RESTORE_FAILED' };
    },
    openKit,
    note: (code) => markJob(repository, null, String(code || 'CONTINGENCY_NOTED')),
  };
}

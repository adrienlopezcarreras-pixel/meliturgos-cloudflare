const TERMINAL = new Set(['COMPLETED', 'COMMITTED', 'CANCELLED', 'FAILED']);

// Owner jobs explicitly identified as legacy/recovered during the September
// cleanup. They must disappear from the active queue but remain persisted for
// traceability instead of being hard-deleted from D1.
const KNOWN_LEGACY_OWNER_JOBS = new Set([
  'owner-chat-d8892391197219d3074cdb72624d9fe4',
  'owner-chat-f8102c96812c7f820a6a1dd7dd3836c8',
  'owner-chat-2a943588ccb07540d9abb6e1e73f8bde',
  'owner-goal-3312c04bb6cdad8a9d60d05c7784d217',
  'owner-goal-13da47fc5162a966b2d2ff1dc388679e',
  'owner-goal-12c17c1f69b226630e2c9e7382d19584',
]);

function upper(value) {
  return String(value || '').toUpperCase();
}

function isRecoveredLegacyOwner(job) {
  if (!job || job.requested_by !== 'owner-chat') return false;
  if (TERMINAL.has(upper(job.status))) return false;
  if (job?.optional_context?.roadmap_id) return false;
  const result = job.result_json && typeof job.result_json === 'object' ? job.result_json : {};
  return Boolean(result.passive_state_recovery || result.last_teacher_stale);
}

function shouldRetire(job, now, staleMs) {
  if (!job || TERMINAL.has(upper(job.status))) return false;
  if (KNOWN_LEGACY_OWNER_JOBS.has(String(job.id || ''))) return true;
  if (!isRecoveredLegacyOwner(job)) return false;
  const updated = Number(job.updated_at || job.created_at || 0);
  return updated > 0 && now - updated >= staleMs;
}

export async function retireObsoleteQueueJobs(repository, {
  now = Date.now(),
  staleMs = 6 * 60 * 60 * 1000,
  limit = 200,
} = {}) {
  if (!repository || typeof repository.list !== 'function' || typeof repository.update !== 'function') {
    throw Object.assign(new Error('QUEUE_HYGIENE_REPOSITORY_REQUIRED'), { code: 'QUEUE_HYGIENE_REPOSITORY_REQUIRED' });
  }

  const jobs = await repository.list();
  const retired = [];
  const failed = [];
  for (const job of jobs.slice(0, Math.max(1, Math.min(500, Number(limit) || 200)))) {
    if (!shouldRetire(job, now, staleMs)) continue;
    try {
      const result = job.result_json && typeof job.result_json === 'object' ? { ...job.result_json } : {};
      result.queue_retirement = {
        status: 'RETIRED_OBSOLETE',
        retired_at: new Date(now).toISOString(),
        previous_status: upper(job.status),
        reason: KNOWN_LEGACY_OWNER_JOBS.has(String(job.id || ''))
          ? 'OWNER_CONFIRMED_LEGACY_QUEUE_ITEM'
          : 'RECOVERED_OWNER_ITEM_STALE_WITHOUT_FRESH_PROGRESS',
        explanation: 'Ancienne demande retirée de la file active. Elle reste archivée dans D1 pour traçabilité et n’empêche plus MEL de traiter les travaux actuels.',
      };
      const updated = await repository.update(job.id, {
        status: 'CANCELLED',
        result_json: result,
        error: null,
      });
      retired.push({
        job_id: updated.id,
        from: upper(job.status),
        to: 'CANCELLED',
        reason: result.queue_retirement.reason,
      });
    } catch (error) {
      failed.push({ job_id: job?.id || null, code: error?.code || error?.message || 'QUEUE_RETIREMENT_FAILED' });
    }
  }

  return {
    attempted: jobs.length,
    retired,
    failed,
    policy: 'archive-not-delete',
  };
}

export { KNOWN_LEGACY_OWNER_JOBS, isRecoveredLegacyOwner, shouldRetire };

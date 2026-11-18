// Read-only diagnostics: never turn an external provider wait into a runnable job.
export function providerWaitProgressIdentity(job, externalProgress) {
  const direct = typeof job?.id === 'string' && job.id.trim() ? job.id : null;
  const deferred = typeof externalProgress?.job_id === 'string' && externalProgress.job_id.trim()
    ? externalProgress.job_id : null;
  const retryAfter = externalProgress?.retry_after;
  const reason = externalProgress?.reason;
  const phase = externalProgress?.phase;
  const attempts = externalProgress?.attempts;
  const maxAttempts = externalProgress?.max_attempts;
  return {
    job_id: direct || deferred,
    ...(typeof reason === 'string' && reason.trim() ? { provider_wait_reason: reason } : {}),
    ...(typeof retryAfter === 'number' && Number.isFinite(retryAfter) && retryAfter > 0
      ? { provider_retry_after: retryAfter } : {}),
    ...(['implementation', 'bridge', 'council'].includes(phase)
      ? { provider_wait_phase: phase } : {}),
    ...(Number.isSafeInteger(attempts) && attempts >= 0
      ? { provider_wait_attempts: attempts } : {}),
    ...(Number.isSafeInteger(maxAttempts) && maxAttempts > 0
      ? { provider_wait_max_attempts: maxAttempts } : {}),
  };
}

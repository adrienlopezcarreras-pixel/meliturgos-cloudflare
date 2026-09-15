import { isPreparedDevBridgeJob } from './d1-dev-job-repository.js';

/**
 * A prepared Teacher-approved Bridge package stops being TEACHER_APPROVED as
 * soon as the local Dev Bridge atomically claims it. The payload remains the
 * same, so recognize that CLAIMED state without weakening the repository's
 * original claimability checks.
 */
export function isClaimedPreparedDevBridgeJob(job) {
  if (String(job?.status || '').toUpperCase() !== 'CLAIMED') return false;
  return isPreparedDevBridgeJob({ ...job, status: 'TEACHER_APPROVED' });
}

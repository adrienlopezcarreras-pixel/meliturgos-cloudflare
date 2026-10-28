import { flattenRoadmap, ROADMAP_STATUSES } from './master-roadmap.js';

// Founder priority 4 covers physical Companion/Android/MINI acceptance. It must
// remain honestly unverified while hardware is absent, but MUST NOT deadlock
// cloud development, MAX or the manifesto accounting job.
export const MANIFEST_01_FOUNDATION = Object.freeze([
  Object.freeze({ priority: 0, roadmap_id: 'MEL-FOUNDER-01', proof: 'REAL_TOOL_RESULT', blocking: true }),
  Object.freeze({ priority: 1, roadmap_id: 'MEL-FOUNDER-02', proof: 'PERSISTENT_RUNTIME_PROGRESS', blocking: true }),
  Object.freeze({ priority: 2, roadmap_id: 'MEL-FOUNDER-03', proof: 'MISSING_CAPABILITY_TO_VERIFIED_DELIVERY', blocking: true }),
  Object.freeze({ priority: 3, roadmap_id: 'MEL-FOUNDER-04', proof: 'DISTINCT_LIVE_COUNCIL_MODELS', blocking: true }),
  Object.freeze({ priority: 4, roadmap_id: 'MEL-FOUNDER-06', proof: 'REAL_DEVICE_ACCEPTANCE', blocking: false }),
]);

export function manifest01FoundationPrerequisites(roadmap = flattenRoadmap()) {
  const items = new Map((Array.isArray(roadmap) ? roadmap : []).map(item => [item?.id, item]));
  const priorities = MANIFEST_01_FOUNDATION.map(requirement => {
    const found = items.get(requirement.roadmap_id);
    const status = String(found?.status || 'NOT_FOUND').trim().toUpperCase();
    const verified = status === ROADMAP_STATUSES.VERIFIED;
    return {
      ...requirement,
      status,
      verified,
      // A nonblocking priority remains recorded as unverified, not passed.
      reason: !found ? 'FOUNDER_ROADMAP_ITEM_MISSING'
        : status === ROADMAP_STATUSES.BLOCKED_HUMAN ? 'PHYSICAL_DEVICE_PROOF_REQUIRED'
          : status === ROADMAP_STATUSES.BLOCKED_EXTERNAL ? 'EXTERNAL_PROOF_REQUIRED'
            : verified ? null : 'FOUNDER_REAL_EXECUTION_NOT_VERIFIED',
    };
  });
  const pending = priorities.filter(row => !row.verified);
  const blockingPending = pending.filter(row => row.blocking);
  const nonblockingPending = pending.filter(row => !row.blocking);
  return {
    schema: 'mel.manifest-01-foundation-prerequisites.v2',
    roadmap_id: 'MEL-MANIFEST-01',
    ready: blockingPending.length === 0,
    all_verified: pending.length === 0,
    verified_count: priorities.length - pending.length,
    required_count: MANIFEST_01_FOUNDATION.length,
    blocking_required_count: priorities.filter(row => row.blocking).length,
    priorities,
    pending: pending.map(({ priority, roadmap_id, reason, blocking }) => ({ priority, roadmap_id, reason, blocking })),
    blocking_pending: blockingPending.map(({ priority, roadmap_id, reason }) => ({ priority, roadmap_id, reason })),
    nonblocking_pending: nonblockingPending.map(({ priority, roadmap_id, reason }) => ({ priority, roadmap_id, reason })),
  };
}
